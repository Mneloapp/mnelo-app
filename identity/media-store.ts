import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  cipherBlob,
  MEDIA_CHUNK_BYTES,
  type CipherBlob,
} from '../src/messenger/delivery/media-schema';
import { DELIVERY_TTL_MS } from '../src/messenger/delivery/schema';

type Row = {
  owner: string;
  id: string;
  recipient: string;
  created_at: number;
  expires_at: number;
  size: number;
  parts: number;
  digest: string;
  complete: number;
  acknowledged: number;
};
type Access = { registered(key: string): boolean; canContact(from: string, to: string): boolean };
const TOTAL_BYTES = 200 * 1024 * 1024,
  RECIPIENT_BYTES = 30 * 1024 * 1024;

// Ciphertext chunks only. File names, MIME type, original hashes and content keys
// belong to the encrypted Signal descriptor and are not accepted by this store.
export class MediaStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly access: Access,
    private readonly now = Date.now,
  ) {
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) throw new Error('MEDIA_SCHEMA_UNSUPPORTED');
    db.exec(`PRAGMA foreign_keys=ON;PRAGMA secure_delete=ON;PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS cipher_blobs(owner TEXT NOT NULL,id TEXT NOT NULL,recipient TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,size INTEGER NOT NULL,parts INTEGER NOT NULL,digest TEXT NOT NULL,complete INTEGER NOT NULL DEFAULT 0,acknowledged INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,id));
      CREATE INDEX IF NOT EXISTS cipher_blob_expiry ON cipher_blobs(expires_at);
      CREATE TABLE IF NOT EXISTS cipher_chunks(owner TEXT NOT NULL,id TEXT NOT NULL,part INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(owner,id,part),FOREIGN KEY(owner,id) REFERENCES cipher_blobs(owner,id) ON DELETE CASCADE);
      PRAGMA user_version=1;`);
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private authorized(actor: string) {
    if (!this.access.registered(actor)) throw new Error('MEDIA_UNAUTHORIZED');
  }
  private allowed(from: string, to: string) {
    return (
      this.access.registered(from) && this.access.registered(to) && this.access.canContact(from, to)
    );
  }
  private row(owner: string, id: string) {
    return this.db.prepare('SELECT * FROM cipher_blobs WHERE owner=? AND id=?').get(owner, id) as
      Row | undefined;
  }
  private usable(row: Row | undefined): asserts row is Row {
    if (!row || row.expires_at <= this.now() || !this.allowed(row.owner, row.recipient))
      throw new Error('MEDIA_UNAVAILABLE');
  }
  prune() {
    this.db.prepare('DELETE FROM cipher_blobs WHERE expires_at<=?').run(this.now());
  }
  begin(actor: string, input: CipherBlob) {
    this.authorized(actor);
    const blob = cipherBlob.parse(input);
    if (actor === blob.recipient || !this.allowed(actor, blob.recipient))
      throw new Error('MEDIA_UNAVAILABLE');
    if (blob.createdAt > this.now() + 300000 || blob.createdAt + DELIVERY_TTL_MS <= this.now())
      throw new Error('MEDIA_EXPIRED');
    return this.transaction(() => {
      this.prune();
      const old = this.row(actor, blob.id);
      if (old) {
        if (
          old.recipient !== blob.recipient ||
          old.created_at !== blob.createdAt ||
          old.size !== blob.size ||
          old.parts !== blob.parts ||
          old.digest !== blob.digest
        )
          throw new Error('MEDIA_CONFLICT');
        if (old.acknowledged) return { present: [], complete: true };
      } else {
        const usage = this.db
          .prepare(
            'SELECT coalesce(sum(size),0) AS bytes,count(*) AS count FROM cipher_blobs WHERE acknowledged=0',
          )
          .get() as { bytes: number; count: number };
        const recipient = this.db
          .prepare(
            'SELECT coalesce(sum(size),0) AS bytes FROM cipher_blobs WHERE recipient=? AND acknowledged=0',
          )
          .get(blob.recipient) as { bytes: number };
        const records = this.db.prepare('SELECT count(*) AS count FROM cipher_blobs').get() as {
          count: number;
        };
        const daily = this.db
          .prepare(
            'SELECT coalesce(sum(size),0) AS bytes FROM cipher_blobs WHERE owner=? AND created_at>?',
          )
          .get(actor, this.now() - 86400000) as { bytes: number };
        if (
          records.count >= 200000 ||
          daily.bytes + blob.size > 100 * 1024 * 1024 ||
          usage.bytes + blob.size > TOTAL_BYTES ||
          usage.count >= 10000 ||
          recipient.bytes + blob.size > RECIPIENT_BYTES
        )
          throw new Error('MEDIA_CAPACITY');
        this.db
          .prepare(
            'INSERT INTO cipher_blobs(owner,id,recipient,created_at,expires_at,size,parts,digest) VALUES(?,?,?,?,?,?,?,?)',
          )
          .run(
            actor,
            blob.id,
            blob.recipient,
            blob.createdAt,
            Math.min(this.now(), blob.createdAt) + DELIVERY_TTL_MS,
            blob.size,
            blob.parts,
            blob.digest,
          );
      }
      const present = (
        this.db
          .prepare('SELECT part FROM cipher_chunks WHERE owner=? AND id=? ORDER BY part')
          .all(actor, blob.id) as { part: number }[]
      ).map((row) => row.part);
      return { present, complete: Boolean(old?.complete) };
    });
  }
  put(actor: string, id: string, part: number, data: string) {
    this.authorized(actor);
    const row = this.row(actor, id);
    this.usable(row);
    if (row.acknowledged) return;
    const bytes = Buffer.from(data, 'base64');
    const expected =
      part === row.parts - 1 ? row.size - part * MEDIA_CHUNK_BYTES : MEDIA_CHUNK_BYTES;
    if (
      !Number.isInteger(part) ||
      part < 0 ||
      part >= row.parts ||
      bytes.length !== expected ||
      bytes.toString('base64') !== data
    )
      throw new Error('MEDIA_SIZE_INVALID');
    const old = this.db
      .prepare('SELECT data FROM cipher_chunks WHERE owner=? AND id=? AND part=?')
      .get(actor, id, part) as { data: Uint8Array } | undefined;
    if (old) {
      if (!Buffer.from(old.data).equals(bytes)) throw new Error('MEDIA_CONFLICT');
      return;
    }
    if (row.complete) throw new Error('MEDIA_CONFLICT');
    this.db.prepare('INSERT INTO cipher_chunks VALUES(?,?,?,?)').run(actor, id, part, bytes);
  }
  finish(actor: string, id: string) {
    this.authorized(actor);
    return this.transaction(() => {
      const row = this.row(actor, id);
      this.usable(row);
      if (row.complete || row.acknowledged) return;
      const digest = createHash('sha256');
      let size = 0,
        parts = 0;
      for (const value of this.db
        .prepare('SELECT part,data FROM cipher_chunks WHERE owner=? AND id=? ORDER BY part')
        .iterate(actor, id)) {
        const chunk = value as { part: number; data: Uint8Array };
        if (chunk.part !== parts++) throw new Error('MEDIA_INCOMPLETE');
        digest.update(chunk.data);
        size += chunk.data.length;
      }
      if (parts !== row.parts || size !== row.size) throw new Error('MEDIA_INCOMPLETE');
      if (digest.digest('hex') !== row.digest) throw new Error('MEDIA_INTEGRITY_INVALID');
      this.db.prepare('UPDATE cipher_blobs SET complete=1 WHERE owner=? AND id=?').run(actor, id);
    });
  }
  get(actor: string, owner: string, id: string, part: number) {
    this.authorized(actor);
    const row = this.row(owner, id);
    this.usable(row);
    if (actor !== row.recipient || !row.complete || row.acknowledged)
      throw new Error('MEDIA_UNAVAILABLE');
    const chunk = this.db
      .prepare('SELECT data FROM cipher_chunks WHERE owner=? AND id=? AND part=?')
      .get(owner, id, part) as { data: Uint8Array } | undefined;
    if (!chunk) throw new Error('MEDIA_UNAVAILABLE');
    return Buffer.from(chunk.data).toString('base64');
  }
  acknowledge(actor: string, owner: string, id: string) {
    this.authorized(actor);
    this.transaction(() => {
      const row = this.row(owner, id);
      if (!row || row.recipient !== actor) return;
      this.db.prepare('DELETE FROM cipher_chunks WHERE owner=? AND id=?').run(owner, id);
      this.db
        .prepare('UPDATE cipher_blobs SET acknowledged=1 WHERE owner=? AND id=?')
        .run(owner, id);
    });
  }
  block(a: string, b: string) {
    this.db
      .prepare(
        'DELETE FROM cipher_blobs WHERE (owner=? AND recipient=?) OR (owner=? AND recipient=?)',
      )
      .run(a, b, b, a);
  }
  unlink(owner: string) {
    this.db.prepare('DELETE FROM cipher_blobs WHERE owner=? OR recipient=?').run(owner, owner);
  }
  close() {
    this.db.close();
  }
}
