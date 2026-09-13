import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, type RandomBytes } from '../crypto';
import type { Media } from '../model';
import type { DeliveryAtomic } from './journal';
import {
  privateMediaDescriptor,
  MEDIA_CHUNK_BYTES,
  type PrivateMediaDescriptor,
} from './media-schema';
import { encryptMedia, decryptMedia, base64ToBytes, bytesToBase64 } from './media-crypto';
import { DELIVERY_TTL_MS } from './schema';

type Upload = {
  id: string;
  peer: string;
  fingerprint: string;
  descriptor: string;
  cipher: Uint8Array;
  uploaded: number;
  created_at: number;
};
type Download = {
  owner: string;
  id: string;
  descriptor: string;
  complete: number;
  acknowledged: number;
  created_at: number;
};
export class MediaJournal {
  constructor(
    private readonly atomic: DeliveryAtomic,
    private readonly own: string,
    private readonly random: RandomBytes,
    private readonly uuid: () => string,
    private readonly now = Date.now,
  ) {}
  initialize() {
    return this.atomic((db) =>
      db.exec(`
      CREATE TABLE IF NOT EXISTS delivery_media_outbox(id TEXT PRIMARY KEY,peer TEXT NOT NULL,message_id TEXT NOT NULL,token TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,descriptor TEXT NOT NULL,cipher BLOB NOT NULL,uploaded INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS delivery_media_inbox(owner TEXT NOT NULL,id TEXT NOT NULL,descriptor TEXT NOT NULL,complete INTEGER NOT NULL DEFAULT 0,acknowledged INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,PRIMARY KEY(owner,id));
      CREATE TABLE IF NOT EXISTS delivery_media_chunks(owner TEXT NOT NULL,id TEXT NOT NULL,part INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(owner,id,part),FOREIGN KEY(owner,id) REFERENCES delivery_media_inbox(owner,id) ON DELETE CASCADE);
    `),
    );
  }
  prepare(peer: string, messageId: string, createdAt: number, media: Media) {
    if (createdAt + DELIVERY_TTL_MS <= this.now() || createdAt > this.now() + 300000)
      throw new Error('MEDIA_EXPIRED');
    const token = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([peer, messageId]))));
    const bytes = base64ToBytes(media.bytes);
    const fingerprint = bytesToHex(sha256(bytes));
    return this.atomic(async (db) => {
      const previous = (
        await db.all<Upload>('SELECT * FROM delivery_media_outbox WHERE token=?', token)
      )[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint || previous.created_at !== createdAt)
          throw new Error('MEDIA_CONFLICT');
        return privateMediaDescriptor.parse(JSON.parse(previous.descriptor));
      }
      const total = (
        await db.all<{ bytes: number }>(
          'SELECT coalesce(sum(length(cipher)),0) AS bytes FROM delivery_media_outbox',
        )
      )[0]!.bytes;
      if (total + bytes.length + 16 > 100 * 1024 * 1024) throw new Error('MEDIA_LOCAL_CAPACITY');
      const encrypted = encryptMedia(
        bytes,
        { owner: this.own, recipient: peer, id: this.uuid(), createdAt },
        this.random,
      );
      await db.run(
        'INSERT INTO delivery_media_outbox(id,peer,message_id,token,fingerprint,descriptor,cipher,created_at) VALUES(?,?,?,?,?,?,?,?)',
        encrypted.descriptor.blob.id,
        peer,
        messageId,
        token,
        fingerprint,
        JSON.stringify(encrypted.descriptor),
        encrypted.encrypted,
        createdAt,
      );
      return encrypted.descriptor;
    });
  }
  upload(id: string) {
    return this.atomic(
      async (db) =>
        (await db.all<Upload>('SELECT * FROM delivery_media_outbox WHERE id=?', id))[0] ?? null,
    );
  }
  uploaded(id: string) {
    return this.atomic((db) =>
      db.run("UPDATE delivery_media_outbox SET uploaded=1,cipher=X'' WHERE id=?", id),
    );
  }
  beginDownload(input: PrivateMediaDescriptor) {
    const descriptor = privateMediaDescriptor.parse(input);
    if (descriptor.blob.recipient !== this.own) throw new Error('MEDIA_UNAUTHORIZED');
    if (
      descriptor.blob.createdAt + DELIVERY_TTL_MS <= this.now() ||
      descriptor.blob.createdAt > this.now() + 300000
    )
      throw new Error('MEDIA_EXPIRED');
    const encoded = JSON.stringify(descriptor);
    return this.atomic(async (db) => {
      const old = (
        await db.all<Download>(
          'SELECT * FROM delivery_media_inbox WHERE owner=? AND id=?',
          descriptor.owner,
          descriptor.blob.id,
        )
      )[0];
      if (old) {
        if (old.complete) return; // Only an opaque consumed/ACK tombstone remains.
        if (old.descriptor !== encoded) throw new Error('MEDIA_INTEGRITY_INVALID');
        return;
      }
      const count = (
        await db.all<{ count: number }>(
          'SELECT count(*) AS count FROM delivery_media_inbox WHERE complete=0',
        )
      )[0]!.count;
      if (count >= 20) throw new Error('MEDIA_LOCAL_CAPACITY');
      await db.run(
        'INSERT INTO delivery_media_inbox(owner,id,descriptor,created_at) VALUES(?,?,?,?)',
        descriptor.owner,
        descriptor.blob.id,
        encoded,
        descriptor.blob.createdAt,
      );
    });
  }
  download(owner: string, id: string) {
    return this.atomic(
      async (db) =>
        (
          await db.all<Download>(
            'SELECT * FROM delivery_media_inbox WHERE owner=? AND id=?',
            owner,
            id,
          )
        )[0] ?? null,
    );
  }
  parts(owner: string, id: string) {
    return this.atomic(async (db) =>
      (
        await db.all<{ part: number }>(
          'SELECT part FROM delivery_media_chunks WHERE owner=? AND id=? ORDER BY part',
          owner,
          id,
        )
      ).map((row) => row.part),
    );
  }
  put(owner: string, id: string, part: number, data: string) {
    return this.atomic(async (db) => {
      const row = (
        await db.all<Download>(
          'SELECT * FROM delivery_media_inbox WHERE owner=? AND id=?',
          owner,
          id,
        )
      )[0];
      if (!row || row.complete) throw new Error('MEDIA_UNAVAILABLE');
      const descriptor = privateMediaDescriptor.parse(JSON.parse(row.descriptor));
      const bytes = base64ToBytes(data);
      const expected =
        part === descriptor.blob.parts - 1
          ? descriptor.blob.size - part * MEDIA_CHUNK_BYTES
          : MEDIA_CHUNK_BYTES;
      if (
        !Number.isInteger(part) ||
        part < 0 ||
        part >= descriptor.blob.parts ||
        bytes.length !== expected ||
        bytesToBase64(bytes) !== data
      )
        throw new Error('MEDIA_INTEGRITY_INVALID');
      const previous = (
        await db.all<{ data: Uint8Array }>(
          'SELECT data FROM delivery_media_chunks WHERE owner=? AND id=? AND part=?',
          owner,
          id,
          part,
        )
      )[0];
      if (previous) {
        if (bytesToBase64(previous.data) !== data) throw new Error('MEDIA_INTEGRITY_INVALID');
        return;
      }
      await db.run('INSERT INTO delivery_media_chunks VALUES(?,?,?,?)', owner, id, part, bytes);
    });
  }
  plaintext(owner: string, id: string) {
    return this.atomic(async (db) => {
      const row = (
        await db.all<Download>(
          'SELECT * FROM delivery_media_inbox WHERE owner=? AND id=?',
          owner,
          id,
        )
      )[0];
      if (!row || row.complete) throw new Error('MEDIA_UNAVAILABLE');
      const descriptor = privateMediaDescriptor.parse(JSON.parse(row.descriptor));
      const chunks = await db.all<{ part: number; data: Uint8Array }>(
        'SELECT part,data FROM delivery_media_chunks WHERE owner=? AND id=? ORDER BY part',
        owner,
        id,
      );
      if (chunks.length !== descriptor.blob.parts) throw new Error('MEDIA_INCOMPLETE');
      const cipher = new Uint8Array(descriptor.blob.size);
      let offset = 0;
      for (const [part, chunk] of chunks.entries()) {
        if (chunk.part !== part) throw new Error('MEDIA_INCOMPLETE');
        cipher.set(chunk.data, offset);
        offset += chunk.data.length;
      }
      if (offset !== cipher.length) throw new Error('MEDIA_INTEGRITY_INVALID');
      return decryptMedia(descriptor, cipher, this.own);
    });
  }
  consumed(owner: string, id: string) {
    return this.atomic(async (db) => {
      // Only call after the complete attachment/message was committed to history.
      await db.run(
        "UPDATE delivery_media_inbox SET complete=1,descriptor='' WHERE owner=? AND id=?",
        owner,
        id,
      );
      await db.run('DELETE FROM delivery_media_chunks WHERE owner=? AND id=?', owner, id);
    });
  }
  acknowledgements() {
    return this.atomic((db) =>
      db.all<{ owner: string; id: string }>(
        'SELECT owner,id FROM delivery_media_inbox WHERE complete=1 AND acknowledged=0 LIMIT 20',
      ),
    );
  }
  acknowledged(owner: string, id: string) {
    return this.atomic((db) =>
      db.run('UPDATE delivery_media_inbox SET acknowledged=1 WHERE owner=? AND id=?', owner, id),
    );
  }
  prune() {
    return this.atomic(async (db) => {
      await db.run(
        'DELETE FROM delivery_media_outbox WHERE created_at<=?',
        this.now() - DELIVERY_TTL_MS,
      );
      // Server retention is over: partial downloads must not permanently occupy
      // all slots. Foreign-key cascade also removes their orphaned chunks.
      await db.run(
        'DELETE FROM delivery_media_inbox WHERE created_at<=?',
        this.now() - DELIVERY_TTL_MS,
      );
    });
  }
}
