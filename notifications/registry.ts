import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  pushRegistration,
  wakeCapability,
  type PushRegistration,
} from '../src/messenger/wake-protocol';
const digest = (capability: string) =>
  createHash('sha256').update(wakeCapability.parse(capability)).digest('hex');
export class WakeRegistry {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE;
      CREATE TABLE IF NOT EXISTS push_routes(owner TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('alert','voip')), environment TEXT NOT NULL CHECK(environment IN ('sandbox','production')), token TEXT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('ios','android')), updated INTEGER NOT NULL, PRIMARY KEY(owner,channel), UNIQUE(token,channel));
      CREATE TABLE IF NOT EXISTS wake_grants(digest TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS wake_grant_owner ON wake_grants(owner);`);
  }
  register(owner: string, input: PushRegistration, now: number) {
    const value = pushRegistration.parse(input);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const collision = this.db
        .prepare('SELECT owner FROM push_routes WHERE token=? AND channel=?')
        .get(value.token, value.channel) as { owner: string } | undefined;
      if (collision && collision.owner !== owner) throw new Error('PUSH_REGISTRATION_CONFLICT');
      this.db
        .prepare(
          'INSERT INTO push_routes VALUES(?,?,?,?,?,?) ON CONFLICT(owner,channel) DO UPDATE SET environment=excluded.environment,token=excluded.token,platform=excluded.platform,updated=excluded.updated',
        )
        .run(owner, value.channel, value.environment, value.token, value.platform, now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  grant(owner: string, capability: string, now: number) {
    this.db.prepare('DELETE FROM wake_grants WHERE expires<=?').run(now);
    const id = digest(capability);
    const existing = this.db.prepare('SELECT owner FROM wake_grants WHERE digest=?').get(id) as
      { owner: string } | undefined;
    if (existing && existing.owner !== owner) throw new Error('PUSH_REGISTRATION_CONFLICT');
    const count = this.db
      .prepare('SELECT count(*) AS count FROM wake_grants WHERE owner=?')
      .get(owner) as { count: number };
    if (!existing && count.count >= 1000) throw new Error('PUSH_RATE_LIMITED');
    const total = this.db.prepare('SELECT count(*) AS count FROM wake_grants').get() as {
      count: number;
    };
    if (!existing && total.count >= 50000) throw new Error('PUSH_RATE_LIMITED');
    this.db
      .prepare(
        'INSERT INTO wake_grants VALUES(?,?,?) ON CONFLICT(digest) DO UPDATE SET expires=excluded.expires',
      )
      .run(id, owner, now + 30 * 86400000);
  }
  revoke(owner: string, capability: string) {
    this.db
      .prepare('DELETE FROM wake_grants WHERE owner=? AND digest=?')
      .run(owner, digest(capability));
  }
  route(
    capability: string,
    channel: 'alert' | 'voip',
    now: number,
  ): (PushRegistration & { owner: string; updated: number }) | undefined {
    return this.db
      .prepare(
        'SELECT r.* FROM push_routes r JOIN wake_grants g ON g.owner=r.owner WHERE g.digest=? AND g.expires>? AND r.channel=?',
      )
      .get(digest(capability), now, channel) as
      (PushRegistration & { owner: string; updated: number }) | undefined;
  }
  invalidate(registration: PushRegistration & { owner: string }, timestamp: number) {
    this.db
      .prepare('DELETE FROM push_routes WHERE owner=? AND channel=? AND token=? AND updated<=?')
      .run(registration.owner, registration.channel, registration.token, timestamp);
  }
  // Server worker only. No API returns this route or token to an app client.
  ownerRoute(owner: string, channel: 'alert' | 'voip') {
    return this.db
      .prepare('SELECT * FROM push_routes WHERE owner=? AND channel=?')
      .get(owner, channel) as (PushRegistration & { owner: string; updated: number }) | undefined;
  }
  disable(owner: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM push_routes WHERE owner=?').run(owner);
      this.db.prepare('DELETE FROM wake_grants WHERE owner=?').run(owner);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
