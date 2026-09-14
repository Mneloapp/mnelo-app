import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, sign, verify } from '../crypto';
import type { LocalDatabase, LocalIdentity } from '../model';
import { peerKey } from '../model';
import { bytesToBase64 } from './media-crypto';
import { wakeEvent, type WakeEvent } from '../wake-protocol';
import {
  DELIVERY_TTL_MS,
  deliveryEnvelope,
  queuedEnvelope,
  signalBindingPayload,
  signalDirectoryIdentity,
  type DeliveryEnvelope,
  type QueuedEnvelope,
  type SignalBundle,
} from './schema';
import type { SignalProvider, SignalState } from './signal';

export type DeliveryAtomic = <T>(operation: (db: LocalDatabase) => Promise<T>) => Promise<T>;
type Outgoing = {
  sequence: number;
  id: string;
  peer: string;
  created_at: number;
  body: string;
  wire: string | null;
  uploaded: number;
  notify: string | null;
};
type Incoming = {
  sender: string;
  id: string;
  hash: string;
  body: string;
  applied: number;
  acknowledged: number;
  created_at: number;
};
export type RetryPhase = 'receive' | 'project' | 'send';
export type RetryCode = 'message-error' | 'identity-changed' | 'update-required' | 'peer-not-ready';
const frame = z
  .object({
    version: z.literal(2),
    id: z.string().uuid(),
    createdAt: z.number().int().nonnegative(),
    from: peerKey,
    to: peerKey,
    body: z.string().max(60000),
    notify: wakeEvent.optional(),
  })
  .strict();
const hash = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text)));
const base64 = (text: string) => bytesToBase64(new TextEncoder().encode(text));
const unbase64 = (text: string) =>
  new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
  );

// Every callback uses the same mutation lock as DeviceMessenger. Decrypt writes
// both the ratchet and a durable local inbox before acknowledging the server.
// A crash before projection into chat history replays that inbox, not decryption.
export class SignalJournal {
  constructor(
    private readonly atomic: DeliveryAtomic,
    private readonly signal: SignalProvider,
    private readonly own: Pick<LocalIdentity, 'key' | 'secret'>,
    private readonly now = Date.now,
  ) {}
  async initialize() {
    return this.atomic(async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS signal_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),owner TEXT NOT NULL,state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS signal_peers(peer TEXT PRIMARY KEY,identity TEXT NOT NULL,registration INTEGER NOT NULL,signature TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS signal_outbox(id TEXT PRIMARY KEY,peer TEXT NOT NULL,token TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,body TEXT NOT NULL,wire TEXT,uploaded INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS signal_pending_outbox ON signal_outbox(uploaded,created_at);
        CREATE TABLE IF NOT EXISTS signal_inbox(sender TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,body TEXT NOT NULL,applied INTEGER NOT NULL DEFAULT 0,acknowledged INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,PRIMARY KEY(sender,id));
        CREATE TABLE IF NOT EXISTS signal_retries(phase TEXT NOT NULL,peer TEXT NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,attempts INTEGER NOT NULL,next_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(phase,peer,id));
      `);
      if (
        !(await db.all<{ name: string }>('PRAGMA table_info(signal_outbox)')).some(
          (row) => row.name === 'notify',
        )
      )
        await db.exec('ALTER TABLE signal_outbox ADD COLUMN notify TEXT');
      const existing = (
        await db.all<{ owner: string; state: SignalState }>(
          'SELECT owner,state FROM signal_state WHERE singleton=1',
        )
      )[0];
      if (existing) {
        if (existing.owner !== this.own.key) throw new Error('SIGNAL_OWNER_CHANGED');
        return (await this.signal.public(existing.state)).result;
      }
      const generated = await this.signal.create();
      await db.run('INSERT INTO signal_state VALUES(1,?,?)', this.own.key, generated.state);
      return generated.result;
    });
  }
  binding(keys: { identity: string; registration: number }) {
    return sign(
      this.own.secret,
      signalBindingPayload({
        owner: this.own.key,
        identity: keys.identity,
        registration: keys.registration,
        device: 1,
      }),
    );
  }
  private async state(db: LocalDatabase) {
    const row = (
      await db.all<{ owner: string; state: SignalState }>(
        'SELECT owner,state FROM signal_state WHERE singleton=1',
      )
    )[0];
    if (!row || row.owner !== this.own.key) throw new Error('SIGNAL_STATE_REQUIRED');
    return row.state;
  }
  async pin(input: z.infer<typeof signalDirectoryIdentity>) {
    const value = signalDirectoryIdentity.parse(input);
    const binding = {
      owner: value.owner,
      identity: value.identity,
      registration: value.registration,
      device: 1 as const,
    };
    if (!verify(value.owner, value.signature, signalBindingPayload(binding)))
      throw new Error('SIGNAL_IDENTITY_INVALID');
    return this.atomic(async (db) => {
      const existing = (
        await db.all<{ identity: string; registration: number }>(
          'SELECT identity,registration FROM signal_peers WHERE peer=?',
          value.owner,
        )
      )[0];
      if (
        existing &&
        (existing.identity !== value.identity || existing.registration !== value.registration)
      )
        throw new Error('SIGNAL_IDENTITY_CHANGED');
      await db.run(
        'INSERT OR IGNORE INTO signal_peers VALUES(?,?,?,?)',
        value.owner,
        value.identity,
        value.registration,
        value.signature,
      );
    });
  }
  async known(peer: string) {
    return this.atomic(
      async (db) =>
        (
          await db.all<{ identity: string; registration: number }>(
            'SELECT identity,registration FROM signal_peers WHERE peer=?',
            peer,
          )
        )[0] ?? null,
    );
  }
  async hasEvent(peer: string, eventKey: string) {
    return this.atomic(
      async (db) =>
        (
          await db.all(
            'SELECT id FROM signal_outbox WHERE token=?',
            hash(JSON.stringify([peer, ['event', eventKey]])),
          )
        ).length > 0,
    );
  }
  async needsBundle(peer: string) {
    return this.atomic(async (db) => this.signal.needsBundle(await this.state(db), peer));
  }
  async replenish(count = 50) {
    return this.atomic(async (db) => {
      const result = await this.signal.replenish(await this.state(db), count);
      await db.run('UPDATE signal_state SET state=? WHERE singleton=1', result.state);
      return result.result;
    });
  }
  async enqueue(
    peer: string,
    id: string,
    body: string,
    createdAt = this.now(),
    eventKey?: string,
    notify?: WakeEvent,
  ) {
    peerKey.parse(peer);
    z.string().uuid().parse(id);
    if (peer === this.own.key || new TextEncoder().encode(body).length > 60000)
      throw new Error('DELIVERY_PAYLOAD_LIMIT');
    if (createdAt + DELIVERY_TTL_MS <= this.now() || createdAt > this.now() + 300000)
      throw new Error('DELIVERY_EXPIRED');
    return this.atomic((db) =>
      this.insertOutgoing(db, peer, id, body, createdAt, eventKey, notify),
    );
  }
  private async insertOutgoing(
    db: LocalDatabase,
    peer: string,
    id: string,
    body: string,
    createdAt: number,
    eventKey?: string,
    notify?: WakeEvent,
  ) {
    const token = hash(JSON.stringify([peer, eventKey ? ['event', eventKey] : ['body', body]]));
    const previous = (
      await db.all<Outgoing>('SELECT * FROM signal_outbox WHERE token=?', token)
    )[0];
    if (previous) return previous.id;
    const count = (
      await db.all<{ count: number }>(
        'SELECT count(*) AS count FROM signal_outbox WHERE uploaded=0',
      )
    )[0]!.count;
    if (count >= 1000) throw new Error('DELIVERY_LOCAL_CAPACITY');
    const total = (
      await db.all<{ count: number }>('SELECT count(*) AS count FROM signal_outbox')
    )[0]!.count;
    if (total >= 200000) throw new Error('DELIVERY_LOCAL_CAPACITY');
    await db.run(
      'INSERT INTO signal_outbox(id,peer,token,created_at,body,notify) VALUES(?,?,?,?,?,?)',
      id,
      peer,
      token,
      createdAt,
      body,
      notify ? JSON.stringify(wakeEvent.parse(notify)) : null,
    );
    return id;
  }
  async pending(after = 0, tokens?: readonly string[]) {
    if (tokens?.length === 0) return [];
    return this.atomic((db) =>
      db.all<Outgoing>(
        `SELECT rowid AS sequence,* FROM signal_outbox WHERE uploaded=0 AND rowid>?
        ${tokens ? `AND token IN (${tokens.map(() => '?').join(',')})` : ''}
        ORDER BY rowid LIMIT 20`,
        after,
        ...(tokens ?? []),
      ),
    );
  }
  async seal(id: string, bundle?: SignalBundle): Promise<DeliveryEnvelope> {
    return this.atomic(async (db) => {
      const row = (await db.all<Outgoing>('SELECT * FROM signal_outbox WHERE id=?', id))[0];
      if (!row) throw new Error('DELIVERY_MISSING');
      if (row.uploaded) throw new Error('DELIVERY_ALREADY_UPLOADED');
      if (row.created_at + DELIVERY_TTL_MS <= this.now()) throw new Error('DELIVERY_EXPIRED');
      if (row.wire) return deliveryEnvelope.parse(JSON.parse(row.wire));
      const notification = row.notify ? { notify: wakeEvent.parse(JSON.parse(row.notify)) } : {};
      const pin = (
        await db.all<{ identity: string; registration: number }>(
          'SELECT identity,registration FROM signal_peers WHERE peer=?',
          row.peer,
        )
      )[0];
      if (
        !pin ||
        (bundle && (bundle.identity !== pin.identity || bundle.registration !== pin.registration))
      )
        throw new Error('SIGNAL_IDENTITY_INVALID');
      const message = base64(
        JSON.stringify(
          frame.parse({
            version: 2,
            id: row.id,
            createdAt: row.created_at,
            from: this.own.key,
            to: row.peer,
            body: row.body,
            ...notification,
          }),
        ),
      );
      const encrypted = await this.signal.encrypt(await this.state(db), {
        own: this.own.key,
        peer: row.peer,
        expectedIdentity: pin.identity,
        message,
        ...(bundle ? { bundle } : {}),
      });
      const wire = deliveryEnvelope.parse({
        version: 2,
        id: row.id,
        createdAt: row.created_at,
        recipient: row.peer,
        type: encrypted.result.type,
        ciphertext: encrypted.result.message,
        ...notification,
      });
      await db.run('UPDATE signal_state SET state=? WHERE singleton=1', encrypted.state);
      await db.run('UPDATE signal_outbox SET wire=? WHERE id=?', JSON.stringify(wire), id);
      return wire;
    });
  }
  async uploaded(id: string) {
    return this.atomic((db) =>
      db.run("UPDATE signal_outbox SET uploaded=1,body='',wire=NULL,notify=NULL WHERE id=?", id),
    );
  }
  async receive(input: QueuedEnvelope) {
    const envelope = queuedEnvelope.parse(input);
    if (
      envelope.recipient !== this.own.key ||
      envelope.createdAt > this.now() + 300000 ||
      envelope.createdAt + DELIVERY_TTL_MS <= this.now()
    )
      throw new Error('DELIVERY_EXPIRED');
    const { sender: _sender, acceptedAt: _accepted, expiresAt: _expires, ...wire } = envelope;
    const digest = hash(JSON.stringify(deliveryEnvelope.parse(wire)));
    return this.atomic(async (db) => {
      const previous = (
        await db.all<Incoming>(
          'SELECT * FROM signal_inbox WHERE sender=? AND id=?',
          envelope.sender,
          envelope.id,
        )
      )[0];
      if (previous) {
        if (previous.hash !== digest) throw new Error('DELIVERY_CONFLICT');
        return;
      }
      const count = (
        await db.all<{ count: number }>(
          'SELECT count(*) AS count FROM signal_inbox WHERE applied=0',
        )
      )[0]!.count;
      if (count >= 1000) throw new Error('DELIVERY_LOCAL_CAPACITY');
      const pin = (
        await db.all<{ identity: string }>(
          'SELECT identity FROM signal_peers WHERE peer=?',
          envelope.sender,
        )
      )[0];
      if (!pin) throw new Error('SIGNAL_IDENTITY_REQUIRED');
      const decrypted = await this.signal.decrypt(await this.state(db), {
        own: this.own.key,
        peer: envelope.sender,
        expectedIdentity: pin.identity,
        type: envelope.type,
        message: envelope.ciphertext,
      });
      const value = frame.parse(JSON.parse(unbase64(decrypted.result.message)));
      if (
        value.id !== envelope.id ||
        value.from !== envelope.sender ||
        value.to !== this.own.key ||
        value.createdAt !== envelope.createdAt ||
        JSON.stringify(value.notify) !== JSON.stringify(envelope.notify)
      )
        throw new Error('DELIVERY_BINDING_INVALID');
      await db.run('UPDATE signal_state SET state=? WHERE singleton=1', decrypted.state);
      await db.run(
        'INSERT INTO signal_inbox(sender,id,hash,body,created_at) VALUES(?,?,?,?,?)',
        envelope.sender,
        envelope.id,
        digest,
        value.body,
        value.createdAt,
      );
    });
  }
  async inbox(after?: { createdAt: number; sender: string; id: string }) {
    return this.atomic((db) =>
      db.all<Incoming>(
        `SELECT * FROM signal_inbox WHERE applied=0 ${after ? 'AND (created_at,sender,id)>(?,?,?)' : ''} ORDER BY created_at,sender,id LIMIT 20`,
        ...(after ? [after.createdAt, after.sender, after.id] : []),
      ),
    );
  }
  async applied(sender: string, id: string, receipt?: { id: string; body: string }) {
    return this.atomic(async (db) => {
      const row = (
        await db.all<Incoming>('SELECT * FROM signal_inbox WHERE sender=? AND id=?', sender, id)
      )[0];
      if (!row || row.applied) return;
      if (receipt) {
        z.string().uuid().parse(receipt.id);
        if (new TextEncoder().encode(receipt.body).length > 60000)
          throw new Error('DELIVERY_PAYLOAD_LIMIT');
        await this.insertOutgoing(db, sender, receipt.id, receipt.body, this.now());
      }
      await db.run("UPDATE signal_inbox SET applied=1,body='' WHERE sender=? AND id=?", sender, id);
    });
  }
  async acknowledgements() {
    return this.atomic((db) =>
      db.all<{ sender: string; id: string }>(
        'SELECT sender,id FROM signal_inbox WHERE applied=1 AND acknowledged=0 LIMIT 20',
      ),
    );
  }
  async acknowledged(sender: string, id: string) {
    return this.atomic((db) =>
      db.run('UPDATE signal_inbox SET acknowledged=1 WHERE sender=? AND id=?', sender, id),
    );
  }
  async prune() {
    return this.atomic(async (db) => {
      await db.run('DELETE FROM signal_retries WHERE expires_at<=?', this.now());
      await db.run('DELETE FROM signal_outbox WHERE created_at<=?', this.now() - DELIVERY_TTL_MS);
      // Past the sender's immutable envelope expiry it cannot be accepted again.
      await db.run(
        'DELETE FROM signal_inbox WHERE applied=1 AND acknowledged=1 AND created_at<=?',
        this.now() - DELIVERY_TTL_MS,
      );
    });
  }
  async retry(phase: RetryPhase, peer: string, id: string) {
    return this.atomic(
      async (db) =>
        (
          await db.all<{ code: RetryCode; next_at: number }>(
            'SELECT code,next_at FROM signal_retries WHERE phase=? AND peer=? AND id=?',
            phase,
            peer,
            id,
          )
        )[0],
    );
  }
  async failed(phase: RetryPhase, peer: string, id: string, createdAt: number, code: RetryCode) {
    return this.atomic(async (db) => {
      const old = (
        await db.all<{ attempts: number }>(
          'SELECT attempts FROM signal_retries WHERE phase=? AND peer=? AND id=?',
          phase,
          peer,
          id,
        )
      )[0];
      if (
        !old &&
        (await db.all<{ n: number }>('SELECT count(*) AS n FROM signal_retries'))[0]!.n >= 3000
      )
        throw new Error('DELIVERY_LOCAL_CAPACITY');
      const attempts = Math.min(1000, (old?.attempts ?? 0) + 1);
      await db.run(
        'INSERT INTO signal_retries VALUES(?,?,?,?,?,?,?) ON CONFLICT(phase,peer,id) DO UPDATE SET code=excluded.code,attempts=excluded.attempts,next_at=excluded.next_at',
        phase,
        peer,
        id,
        code,
        attempts,
        this.now() + Math.min(300000, 2500 * 2 ** Math.min(7, attempts)),
        createdAt + DELIVERY_TTL_MS,
      );
    });
  }
  async recovered(phase: RetryPhase, peer: string, id: string) {
    return this.atomic((db) =>
      db.run('DELETE FROM signal_retries WHERE phase=? AND peer=? AND id=?', phase, peer, id),
    );
  }
}
