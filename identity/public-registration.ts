import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { getCountries, parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { z } from 'zod';
import { internationalPhone } from '../src/messenger/phone-protocol';
import { peerKey } from '../src/messenger/model';
import type { SmsAdmission, SmsRequestContext } from './verification';

const countries = new Set<string>(getCountries());
const configuration = z
  .object({
    version: z.literal(1),
    smsBudget: z.literal('uncapped'),
    // Account-specific provider/sender coverage, not a guessed worldwide list.
    allowedCountries: z
      .array(z.string().refine((v) => countries.has(v)))
      .min(1)
      .max(250),
    blockedPrefixes: z.array(z.string().regex(/^\+[1-9]\d{1,13}$/)).max(1000),
    coverageVerifiedAt: z.iso.datetime(),
  })
  .strict();

export function publicRegistrationPolicy(input: unknown) {
  const parsed = configuration.safeParse(input);
  if (
    !parsed.success ||
    new Set(parsed.data.allowedCountries).size !== parsed.data.allowedCountries.length ||
    new Set(parsed.data.blockedPrefixes).size !== parsed.data.blockedPrefixes.length
  )
    throw new Error('PUBLIC_REGISTRATION_CONFIGURATION_INVALID');
  return parsed.data;
}

// Normalize the trusted source before HMAC. Rotating IPv6 interface identifiers
// inside the same /64 must not reset the source throttle; IPv4-mapped addresses
// share a bucket with their ordinary IPv4 spelling.
function networkSource(value: string) {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes('%')) throw new Error('PHONE_REQUEST_FAILED');
  const normalized = new URL('http://[' + value + ']').hostname.slice(1, -1);
  const [left, right] = normalized.split('::');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const groups =
    right === undefined
      ? start
      : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
  const words = groups.map((part: string) => Number.parseInt(part, 16));
  if (words.length !== 8 || words.some((part) => !Number.isInteger(part)))
    throw new Error('PHONE_REQUEST_FAILED');
  if (words.slice(0, 5).every((part) => part === 0) && words[5] === 0xffff)
    return [words[6]! >> 8, words[6]! & 255, words[7]! >> 8, words[7]! & 255].join('.');
  return (
    words
      .slice(0, 4)
      .map((part) => part.toString(16))
      .join(':') + '::/64'
  );
}

const limits = [
  ['phone-minute', 'phone', 60000, 1],
  ['phone-hour', 'phone', 3600000, 5],
  ['phone-day', 'phone', 86400000, 10],
  ['device-hour', 'device', 3600000, 5],
  ['source-hour', 'source', 3600000, 100],
] as const;

// Business volume has no hourly/daily/monthly cap. These are durable abuse
// controls for individual numbers, signed device keys and trusted networks.
// Only keyed digests are persisted; no numbers, PINs, device keys or raw IPs.
export class PublicSmsGuard implements SmsAdmission {
  readonly publicRegistration = true;
  private readonly policy: ReturnType<typeof publicRegistrationPolicy>;
  private readonly allowed: Set<string>;
  private readonly secret: Buffer;
  constructor(
    private readonly db: DatabaseSync,
    input: unknown,
    secret: Uint8Array,
    private readonly now = Date.now,
  ) {
    this.policy = publicRegistrationPolicy(input);
    this.allowed = new Set(this.policy.allowedCountries);
    if (secret.length !== 32) throw new Error('PUBLIC_REGISTRATION_CONFIGURATION_INVALID');
    this.secret = Buffer.from(secret);
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) throw new Error('SMS_ABUSE_SCHEMA_UNSUPPORTED');
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sms_abuse_limits (
        scope TEXT NOT NULL,
        subject TEXT NOT NULL CHECK(length(subject)=64),
        started_at INTEGER NOT NULL CHECK(started_at>=0),
        expires_at INTEGER NOT NULL CHECK(expires_at>started_at),
        used INTEGER NOT NULL CHECK(used>0),
        PRIMARY KEY(scope,subject)
      );
      CREATE INDEX IF NOT EXISTS sms_abuse_expiry ON sms_abuse_limits(expires_at);
      CREATE TABLE IF NOT EXISTS sms_abuse_clock (
        id INTEGER PRIMARY KEY CHECK(id=1),
        last_at INTEGER NOT NULL CHECK(last_at>=0)
      ); PRAGMA user_version=1;`);
  }
  reserve(index: string, context?: SmsRequestContext) {
    if (!context || !/^[a-f0-9]{64}$/.test(index) || !peerKey.safeParse(context.key).success)
      throw new Error('PHONE_REQUEST_FAILED');
    const phone = internationalPhone.safeParse(context.phone);
    const country = phone.success ? parsePhoneNumberFromString(phone.data)?.country : undefined;
    if (
      !phone.success ||
      !country ||
      !this.allowed.has(country) ||
      this.policy.blockedPrefixes.some((prefix) => phone.data.startsWith(prefix))
    )
      throw new Error('PHONE_PROVIDER_UNAVAILABLE');
    const subjects = { phone: index, device: context.key, source: networkSource(context.source) };
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('PHONE_RATE_LIMITED');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const clock = this.db.prepare('SELECT last_at FROM sms_abuse_clock WHERE id=1').get() as
        { last_at: number } | undefined;
      if (clock && now < clock.last_at) throw new Error('PHONE_RATE_LIMITED');
      this.db.prepare('DELETE FROM sms_abuse_limits WHERE expires_at<=?').run(now);
      for (const [scope, subject, duration, max] of limits) {
        const digest = createHmac('sha256', this.secret)
          .update('mnelo-sms-abuse-v1:' + subject + ':' + subjects[subject])
          .digest('hex');
        const row = this.db
          .prepare('SELECT used FROM sms_abuse_limits WHERE scope=? AND subject=?')
          .get(scope, digest) as { used: number } | undefined;
        if (row && row.used >= max) throw new Error('PHONE_RATE_LIMITED');
        this.db
          .prepare(
            'INSERT INTO sms_abuse_limits VALUES(?,?,?,?,1) ON CONFLICT(scope,subject) DO UPDATE SET used=used+1',
          )
          .run(scope, digest, now, now + duration);
      }
      this.db
        .prepare(
          'INSERT INTO sms_abuse_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at',
        )
        .run(now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    // Reservation precedes provider I/O. Timeouts/errors do not refund or retry.
  }
  prune() {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const clock = this.db.prepare('SELECT last_at FROM sms_abuse_clock WHERE id=1').get() as
        { last_at: number } | undefined;
      if (!clock || now >= clock.last_at) {
        this.db.prepare('DELETE FROM sms_abuse_limits WHERE expires_at<=?').run(now);
        this.db
          .prepare(
            'INSERT INTO sms_abuse_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at',
          )
          .run(now);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.secret.fill(0);
    this.db.close();
  }
}
