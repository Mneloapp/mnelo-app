import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { verify } from '../src/messenger/crypto';
import {
  publishedSignalKeys,
  signalBindingPayload,
  type PublishedSignalKeys,
  type SignalBundle,
} from '../src/messenger/delivery/schema';
import { peerKey } from '../src/messenger/model';

type IdentityRow = {
  identity: string;
  registration: number;
  signed: string;
  signature: string;
  high_water: number;
};
export class SignalDirectory {
  constructor(private readonly db: DatabaseSync) {
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) throw new Error('SIGNAL_DIRECTORY_SCHEMA_UNSUPPORTED');
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS signal_identities (
        owner TEXT PRIMARY KEY, identity TEXT NOT NULL, registration INTEGER NOT NULL,
        signed TEXT NOT NULL, signature TEXT NOT NULL, high_water INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS signal_one_time_keys (
        owner TEXT NOT NULL REFERENCES signal_identities(owner) ON DELETE CASCADE,
        id INTEGER NOT NULL, public_data TEXT NOT NULL, hash TEXT NOT NULL,
        PRIMARY KEY(owner,id)
      );
      CREATE TABLE IF NOT EXISTS signal_key_leases (
        actor TEXT NOT NULL, owner TEXT NOT NULL REFERENCES signal_identities(owner) ON DELETE CASCADE,
        request TEXT NOT NULL, response TEXT NOT NULL, expires_at INTEGER NOT NULL,
        PRIMARY KEY(actor,owner,request)
      );
      CREATE INDEX IF NOT EXISTS signal_key_lease_expiry ON signal_key_leases(expires_at);
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
  publish(owner: string, input: PublishedSignalKeys, signature: string) {
    peerKey.parse(owner);
    const keys = publishedSignalKeys.parse(input);
    const binding = {
      owner,
      identity: keys.identity,
      registration: keys.registration,
      device: 1 as const,
    };
    if (!verify(owner, signature, signalBindingPayload(binding)))
      throw new Error('SIGNAL_IDENTITY_INVALID');
    if (
      new Set(keys.oneTime.map((k) => k.id)).size !== keys.oneTime.length ||
      keys.oneTime.some((k) => k.id !== k.kyber.id)
    )
      throw new Error('SIGNAL_KEYS_INVALID');
    this.transaction(() => {
      const previous = this.db
        .prepare('SELECT * FROM signal_identities WHERE owner=?')
        .get(owner) as IdentityRow | undefined;
      if (
        previous &&
        (previous.identity !== keys.identity || previous.registration !== keys.registration)
      )
        throw new Error('SIGNAL_IDENTITY_CHANGED');
      const signed = JSON.stringify(keys.signed);
      if (previous) {
        const oldSigned = JSON.parse(previous.signed) as { id: number };
        if (
          keys.signed.id < oldSigned.id ||
          (keys.signed.id === oldSigned.id && signed !== previous.signed)
        )
          throw new Error('SIGNAL_KEYS_INVALID');
      }
      const highWater = previous?.high_water ?? 0;
      const count = this.db
        .prepare('SELECT count(*) AS count FROM signal_one_time_keys WHERE owner=?')
        .get(owner) as { count: number };
      if (count.count + keys.oneTime.filter((k) => k.id > highWater).length > 200)
        throw new Error('SIGNAL_KEYS_CAPACITY');
      this.db
        .prepare(
          `INSERT INTO signal_identities(owner,identity,registration,signed,signature) VALUES(?,?,?,?,?)
        ON CONFLICT(owner) DO UPDATE SET signed=excluded.signed,signature=excluded.signature`,
        )
        .run(owner, keys.identity, keys.registration, signed, signature);
      let maximum = highWater;
      for (const key of keys.oneTime) {
        const data = JSON.stringify(key),
          hash = createHash('sha256').update(data).digest('hex');
        const existing = this.db
          .prepare('SELECT hash FROM signal_one_time_keys WHERE owner=? AND id=?')
          .get(owner, key.id) as { hash: string } | undefined;
        if (existing) {
          if (existing.hash !== hash) throw new Error('SIGNAL_KEYS_INVALID');
          continue;
        }
        // A consumed key remains below high_water forever; a retry/publication
        // from an offline client cannot accidentally make it one-time again.
        if (key.id <= highWater) continue;
        this.db
          .prepare('INSERT INTO signal_one_time_keys VALUES(?,?,?,?)')
          .run(owner, key.id, data, hash);
        maximum = Math.max(maximum, key.id);
      }
      this.db
        .prepare('UPDATE signal_identities SET high_water=? WHERE owner=?')
        .run(maximum, owner);
    });
    return this.count(owner);
  }
  identity(owner: string) {
    const row = this.db.prepare('SELECT * FROM signal_identities WHERE owner=?').get(owner) as
      IdentityRow | undefined;
    if (!row) return null;
    return {
      owner,
      identity: row.identity,
      registration: row.registration,
      device: 1 as const,
      signed: publishedSignalKeys.shape.signed.parse(JSON.parse(row.signed)),
      signature: row.signature,
    };
  }
  take(
    owner: string,
    lease?: { actor: string; request: string; now: number },
  ): { bundle: SignalBundle; signature: string } | null {
    return this.transaction(() => {
      if (lease) {
        this.db.prepare('DELETE FROM signal_key_leases WHERE expires_at<=?').run(lease.now);
        const existing = this.db
          .prepare('SELECT response FROM signal_key_leases WHERE actor=? AND owner=? AND request=?')
          .get(lease.actor, owner, lease.request) as { response: string } | undefined;
        if (existing)
          return JSON.parse(existing.response) as { bundle: SignalBundle; signature: string };
        const count = this.db.prepare('SELECT count(*) AS count FROM signal_key_leases').get() as {
          count: number;
        };
        if (count.count >= 10000) throw new Error('SIGNAL_KEYS_CAPACITY');
      }
      const identity = this.identity(owner);
      if (!identity) return null;
      const key = this.db
        .prepare(
          'SELECT id,public_data FROM signal_one_time_keys WHERE owner=? ORDER BY id LIMIT 1',
        )
        .get(owner) as { id: number; public_data: string } | undefined;
      if (!key) return null;
      this.db.prepare('DELETE FROM signal_one_time_keys WHERE owner=? AND id=?').run(owner, key.id);
      const { signature, owner: _owner, ...publicIdentity } = identity;
      const result = {
        bundle: { ...publicIdentity, oneTime: JSON.parse(key.public_data) },
        signature,
      };
      if (lease)
        this.db
          .prepare('INSERT INTO signal_key_leases VALUES(?,?,?,?,?)')
          .run(lease.actor, owner, lease.request, JSON.stringify(result), lease.now + 600000);
      return result;
    });
  }
  count(owner: string) {
    return (
      this.db
        .prepare('SELECT count(*) AS count FROM signal_one_time_keys WHERE owner=?')
        .get(owner) as { count: number }
    ).count;
  }
  prune(now = Date.now()) {
    this.db.prepare('DELETE FROM signal_key_leases WHERE expires_at<=?').run(now);
  }
  leased(actor: string, owner: string, request: string, now = Date.now()) {
    return Boolean(
      this.db
        .prepare(
          'SELECT 1 FROM signal_key_leases WHERE actor=? AND owner=? AND request=? AND expires_at>?',
        )
        .get(actor, owner, request, now),
    );
  }
  unlink(owner: string) {
    this.db.prepare('DELETE FROM signal_key_leases WHERE actor=?').run(owner);
    this.db.prepare('DELETE FROM signal_identities WHERE owner=?').run(owner);
  }
  close() {
    this.db.close();
  }
}
