import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';

export class PhoneRegistry {
  constructor(
    private readonly db: DatabaseSync,
    private readonly indexSecret: Uint8Array,
  ) {
    if (indexSecret.length !== 32) throw new Error('IDENTITY_CONFIGURATION_INVALID');
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) throw new Error('IDENTITY_SCHEMA_UNSUPPORTED');
    db.exec(`PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE;
      CREATE TABLE IF NOT EXISTS phone_identities(
        phone_index TEXT PRIMARY KEY, public_key TEXT NOT NULL UNIQUE,
        discoverable INTEGER NOT NULL CHECK(discoverable IN (0,1)), verified_at INTEGER NOT NULL
      ); PRAGMA user_version=1;`);
  }
  index(phone: string) {
    return createHmac('sha256', this.indexSecret)
      .update('mnelo-phone-index-v1:' + phone)
      .digest('hex');
  }
  status(key: string) {
    return this.db
      .prepare('SELECT discoverable FROM phone_identities WHERE public_key=?')
      .get(key) as { discoverable: number } | undefined;
  }
  indexForKey(key: string) {
    const row = this.db
      .prepare('SELECT phone_index FROM phone_identities WHERE public_key=?')
      .get(key) as { phone_index: string } | undefined;
    return row?.phone_index ?? null;
  }
  bind(index: string, key: string, discoverable: boolean, now: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db
        .prepare('SELECT public_key FROM phone_identities WHERE phone_index=?')
        .get(index) as { public_key: string } | undefined;
      // SMS possession alone must not replace somebody's pinned encryption identity.
      if (existing && existing.public_key !== key) throw new Error('IDENTITY_RECOVERY_REQUIRED');
      this.db
        .prepare('DELETE FROM phone_identities WHERE public_key=? AND phone_index<>?')
        .run(key, index);
      this.db
        .prepare(
          'INSERT INTO phone_identities VALUES(?,?,?,?) ON CONFLICT(phone_index) DO UPDATE SET discoverable=excluded.discoverable, verified_at=excluded.verified_at',
        )
        .run(index, key, Number(discoverable), now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  lookup(index: string) {
    const row = this.db
      .prepare('SELECT public_key FROM phone_identities WHERE phone_index=? AND discoverable=1')
      .get(index) as { public_key: string } | undefined;
    return row?.public_key ?? null;
  }
  visibility(key: string, discoverable: boolean) {
    this.db
      .prepare('UPDATE phone_identities SET discoverable=? WHERE public_key=?')
      .run(Number(discoverable), key);
  }
  unlink(key: string) {
    this.db.prepare('DELETE FROM phone_identities WHERE public_key=?').run(key);
  }
  close() {
    this.db.close();
  }
}
