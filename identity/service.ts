import { randomBytes, randomUUID } from 'node:crypto';
import { peerKey } from '../src/messenger/model';
import { verify } from '../src/messenger/crypto';
import { phoneProof, phoneProofPayload, type PhoneResponse } from '../src/messenger/phone-protocol';
import { PhoneRegistry } from './registry';
import type { SmsVerification } from './verification';
import type { TurnIssuer } from './turn';
import type { WakeService } from '../notifications/service';
import type { IdentityAccess } from './review-access';
import type { DeliveryService } from './delivery-service';

type Attempt = {
  key: string;
  index: string;
  verification: string;
  expires: number;
  checks: number;
  busy: boolean;
  review: boolean;
};
export class PhoneService {
  private challenges = new Map<string, { key: string; expires: number }>();
  private attempts = new Map<string, Attempt>();
  private sending = new Set<string>();
  private limits = new Map<string, { count: number; expires: number }>();
  constructor(
    private readonly registry: PhoneRegistry,
    private readonly sms: SmsVerification,
    private readonly now = Date.now,
    private readonly admission?: { reserve(index: string): void },
    private readonly turn?: TurnIssuer,
    private readonly wake?: WakeService,
    private readonly access?: IdentityAccess,
    private readonly delivery?: DeliveryService,
  ) {}
  private prune() {
    for (const map of [this.challenges, this.attempts, this.limits])
      for (const [key, value] of map) if (value.expires <= this.now()) map.delete(key);
  }
  private limit(key: string, max: number, duration: number) {
    this.prune();
    const row = this.limits.get(key) ?? { count: 0, expires: this.now() + duration };
    if (this.limits.size >= 10000 || ++row.count > max) throw new Error('PHONE_RATE_LIMITED');
    this.limits.set(key, row);
  }
  challenge(key: string, source: string) {
    peerKey.parse(key);
    // A shared mobile carrier/Wi-Fi address may represent all 50 development
    // testers. Signed per-device and action-specific quotas still apply below.
    this.limit('challenge:' + source, 1200, 60000);
    // A live chat can exchange submit, delivered and read controls each second.
    // Only admitted registered identities receive the interactive budget; SMS,
    // lookup and prekey quotas below remain independent and unchanged.
    const registered = (!this.access || this.access.scope(key)) && this.registry.status(key);
    this.limit('challenge-key:' + key, registered ? 360 : 120, 60000);
    if (this.challenges.size >= 1000) throw new Error('PHONE_RATE_LIMITED');
    const nonce = randomBytes(32).toString('hex');
    this.challenges.set(nonce, { key, expires: this.now() + 60000 });
    return { nonce };
  }
  async execute(input: unknown, source: string): Promise<PhoneResponse> {
    this.prune();
    this.limit('execute:' + source, 1200, 60000);
    const proof = phoneProof.parse(input);
    const challenge = this.challenges.get(proof.nonce);
    this.challenges.delete(proof.nonce);
    if (
      !challenge ||
      challenge.key !== proof.key ||
      !verify(proof.key, proof.signature, phoneProofPayload(proof.key, proof.nonce, proof.command))
    )
      throw new Error('PHONE_UNAUTHORIZED');
    const { key, command } = proof;
    if (command.action === 'send') {
      if (this.sending.has(key)) throw new Error('PHONE_RATE_LIMITED');
      const index = this.registry.index(command.phone);
      this.access?.assertEnrollment(key, index);
      const review = Boolean(this.access?.review?.contains(index));
      this.limit('sms-minute:' + index, 1, 60000);
      this.limit('sms-hour:' + index, 5, 3600000);
      this.limit('sms-device:' + key, 5, 3600000);
      this.limit('sms-source:' + source, 10, 3600000);
      this.limit('sms-global', 100, 3600000);
      if (this.attempts.size >= 1000) throw new Error('PHONE_RATE_LIMITED');
      if (!review) this.admission?.reserve(index);
      this.sending.add(key);
      try {
        const verification = review ? 'review' : await this.sms.send(command.phone);
        // A rejected resend must leave the previous code usable until its original expiry.
        for (const [id, item] of this.attempts) if (item.key === key) this.attempts.delete(id);
        const attempt = randomUUID(),
          expires = this.now() + 600000;
        this.attempts.set(attempt, {
          key,
          index,
          verification,
          expires,
          checks: 0,
          busy: false,
          review,
        });
        return {
          attempt,
          expires,
          retryAt: this.now() + 60000,
          testOnly: review || this.sms.testOnly,
          ...(review ? { reviewAccount: true } : {}),
        };
      } finally {
        this.sending.delete(key);
      }
    }
    if (command.action === 'verify') {
      if (this.sending.has(key)) throw new Error('PHONE_RATE_LIMITED');
      const item = this.attempts.get(command.attempt);
      if (!item || item.key !== key) throw new Error('PHONE_CODE_EXPIRED');
      if (item.busy || item.checks >= 5) throw new Error('PHONE_RATE_LIMITED');
      item.busy = true;
      item.checks++;
      try {
        const valid = item.review
          ? this.access?.review?.check(item.index, command.code)
          : /^\d{6}$/.test(command.code) && (await this.sms.check(item.verification, command.code));
        if (!valid) throw new Error('PHONE_CODE_INVALID');
        if (this.attempts.get(command.attempt) !== item || item.expires <= this.now())
          throw new Error('PHONE_CODE_EXPIRED');
        this.attempts.delete(command.attempt);
        this.access?.assertEnrollment(key, item.index);
        this.registry.bind(item.index, key, command.discoverable, this.now());
        return { registered: true, discoverable: command.discoverable };
      } finally {
        item.busy = false;
      }
    }
    const registration =
      this.access && !this.access.scope(key) ? undefined : this.registry.status(key);
    if (command.action === 'status')
      return {
        registered: Boolean(registration),
        discoverable: Boolean(registration?.discoverable),
      };
    if (!registration) throw new Error('PHONE_REGISTRATION_REQUIRED');
    if (command.action.startsWith('delivery-')) {
      if (!this.delivery) throw new Error('DELIVERY_UNAVAILABLE');
      this.limit('delivery-device:' + key, 360, 60000);
      if (command.action === 'delivery-verify-sender') {
        // Only confirm a number voluntarily shared inside an envelope already
        // addressed to this actor. This is not a reverse-number directory.
        this.limit('delivery-sender-verification:' + key, 30, 3600000);
        this.limit(
          'delivery-sender-envelope:' + key + ':' + command.peer + ':' + command.id,
          3,
          3600000,
        );
        return {
          delivery: {
            version: 2,
            verified:
              this.delivery.store.hasPending(key, command.peer, command.id) &&
              this.registry.indexForKey(command.peer) === this.registry.index(command.phone),
          },
        };
      }
      if (
        command.action === 'delivery-keys' &&
        !this.delivery.directory.leased(key, command.peer, command.request, this.now())
      ) {
        this.limit('prekey-device:' + key, 30, 3600000);
        this.limit('prekey-pair:' + key + ':' + command.peer, 4, 3600000);
      }
      if (command.action === 'delivery-identity')
        this.limit('signal-identity:' + key, 120, 3600000);
      if (command.action === 'delivery-publish') this.limit('prekey-publish:' + key, 12, 3600000);
      return { delivery: this.delivery.execute(key, command) };
    }
    if (command.action.startsWith('push-') || command.action.startsWith('wake')) {
      if (!this.wake) throw new Error('PUSH_UNAVAILABLE');
      await this.wake.execute(key, command);
      return { ok: true };
    }
    if (command.action === 'ice') {
      this.limit('ice-device:' + key, 12, 3600000);
      if (!this.turn) throw new Error('TURN_UNAVAILABLE');
      return { ice: this.turn.issue(key) };
    }
    if (command.action === 'lookup') {
      this.limit('lookup-device:' + key, 30, 3600000);
      this.limit('lookup-source:' + source, 60, 3600000);
      const target = this.registry.lookup(this.registry.index(command.phone));
      return {
        key:
          target &&
          (!this.access || this.access.canContact(key, target)) &&
          (!this.delivery || this.delivery.store.allowed(key, target))
            ? target
            : null,
      };
    }
    if (command.action === 'visibility') {
      this.registry.visibility(key, command.discoverable);
      return { registered: true, discoverable: command.discoverable };
    }
    if (command.action !== 'unlink') throw new Error('PHONE_REQUEST_FAILED');
    this.wake?.disable(key);
    this.delivery?.unlink(key);
    this.registry.unlink(key);
    return { ok: true, registered: false };
  }
}
