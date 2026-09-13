import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

// Development admission is checked before any provider request. Only HMAC indexes
// are configured; durable budgets contain aggregate counts, never numbers/IPs/keys.
export class DevelopmentSmsGuard {
  private readonly admitted: Set<string>;
  constructor(
    private readonly db: DatabaseSync,
    allowedIndexes: string,
    private readonly now = Date.now,
  ) {
    const values = allowedIndexes.split(',');
    const parsed = z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .min(1)
      .max(50)
      .safeParse(values);
    if (!parsed.success || new Set(parsed.data).size !== parsed.data.length)
      throw new Error('IDENTITY_ADMISSION_CONFIGURATION_INVALID');
    this.admitted = new Set(parsed.data);
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) throw new Error('SMS_BUDGET_SCHEMA_UNSUPPORTED');
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS sms_budgets (
        scope TEXT PRIMARY KEY CHECK(scope IN ('hour','day')),
        started_at INTEGER NOT NULL CHECK(started_at>=0),
        used INTEGER NOT NULL CHECK(used>=0)
      ); PRAGMA user_version=1;`);
  }
  reserve(index: string) {
    // Same public error as unavailable provider; do not advertise a tester directory.
    if (!this.admitted.has(index)) throw new Error('PHONE_PROVIDER_UNAVAILABLE');
    const now = this.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [scope, duration, max] of [
        ['hour', 3600000, 10],
        ['day', 86400000, 15],
      ] as const) {
        const row = this.db
          .prepare('SELECT started_at, used FROM sms_budgets WHERE scope=?')
          .get(scope) as { started_at: number; used: number } | undefined;
        if (row && now < row.started_at) throw new Error('PHONE_RATE_LIMITED');
        const expired = !row || now >= row.started_at + duration;
        const used = expired ? 0 : row.used;
        if (used >= max) throw new Error('PHONE_RATE_LIMITED');
        this.db
          .prepare(
            'INSERT INTO sms_budgets VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET started_at=excluded.started_at, used=excluded.used',
          )
          .run(scope, expired ? now : row.started_at, used + 1);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    // A failed/uncertain provider request consumes a reservation too. No automatic refund/retry.
  }
  admits(index: string) {
    return this.admitted.has(index);
  }
  close() {
    this.db.close();
  }
}
