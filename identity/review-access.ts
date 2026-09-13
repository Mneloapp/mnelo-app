import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { reviewPhones } from '../src/messenger/review-account';
import type { PhoneRegistry } from './registry';

const configuration = z
  .object({
    createdAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    accounts: z
      .array(
        z
          .object({
            phone: z.enum(reviewPhones),
            secretHash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .length(2),
  })
  .strict();

// A distinct, expiring review credential. Never uses the local fixture PIN or SMS.
export class ReviewAccess {
  private readonly config: z.infer<typeof configuration>;
  private readonly accounts: Map<string, string>;
  constructor(
    input: unknown,
    index: (phone: string) => string,
    private readonly now = Date.now,
  ) {
    this.config = configuration.parse(input);
    const { createdAt, expiresAt, accounts } = this.config;
    if (
      expiresAt <= createdAt ||
      expiresAt - createdAt > 14 * 86400000 ||
      new Set(accounts.map((a) => a.phone)).size !== 2 ||
      new Set(accounts.map((a) => a.secretHash)).size !== 2
    )
      throw new Error('REVIEW_CONFIGURATION_INVALID');
    this.accounts = new Map(accounts.map((a) => [index(a.phone), a.secretHash]));
  }
  contains(index: string) {
    return this.accounts.has(index);
  }
  active() {
    return this.now() >= this.config.createdAt && this.now() < this.config.expiresAt;
  }
  check(index: string, secret: string) {
    const hash = this.accounts.get(index);
    if (!hash || !this.active() || !/^[a-f0-9]{32}$/.test(secret)) return false;
    return timingSafeEqual(Buffer.from(hash, 'hex'), createHash('sha256').update(secret).digest());
  }
}

export class IdentityAccess {
  constructor(
    private readonly registry: PhoneRegistry,
    private readonly admitted: (index: string) => boolean,
    readonly review?: ReviewAccess,
  ) {
    if (review && reviewPhones.some((phone) => admitted(registry.index(phone))))
      throw new Error('REVIEW_OVERLAPS_REAL_ADMISSION');
  }
  scope(key: string): 'development' | 'review' | null {
    const index = this.registry.indexForKey(key);
    if (!index) return null;
    if (this.review?.contains(index)) return this.review.active() ? 'review' : null;
    return this.admitted(index) ? 'development' : null;
  }
  canContact(from: string, to: string) {
    const scope = this.scope(from);
    return scope !== null && scope === this.scope(to);
  }
  assertEnrollment(key: string, index: string) {
    const existing = this.registry.indexForKey(key);
    const review = Boolean(this.review?.contains(index));
    if (existing && Boolean(this.review?.contains(existing)) !== review)
      throw new Error('PHONE_PROVIDER_UNAVAILABLE');
    if (review ? !this.review?.active() : !this.admitted(index))
      throw new Error('PHONE_PROVIDER_UNAVAILABLE');
  }
}
