import { createHash } from 'node:crypto';
import type { PhoneCommand } from '../src/messenger/phone-protocol';
import type { PushProvider, PushDeliveryOptions } from './apns';
import type { WakeEvent } from '../src/messenger/wake-protocol';
import type { WakeRegistry } from './registry';
export class WakeService {
  private limits = new Map<string, { count: number; expires: number }>();
  private seen = new Map<string, number>();
  private inFlight = 0;
  constructor(
    private readonly registry: WakeRegistry,
    private readonly provider: PushProvider,
    private readonly now = Date.now,
    private readonly canContact?: (from: string, to: string) => boolean,
  ) {}
  private limit(key: string, max: number, duration: number) {
    for (const [id, item] of this.limits) if (item.expires <= this.now()) this.limits.delete(id);
    if (this.limits.size >= 10000) throw new Error('PUSH_RATE_LIMITED');
    const value = this.limits.get(key) ?? { count: 0, expires: this.now() + duration };
    if (++value.count > max) throw new Error('PUSH_RATE_LIMITED');
    this.limits.set(key, value);
  }
  disable(key: string) {
    this.registry.disable(key);
  }
  async deliverQueued(
    sender: string,
    recipient: string,
    event: WakeEvent,
    options: PushDeliveryOptions,
  ) {
    if (!this.canContact || !this.canContact(sender, recipient)) return false;
    if (options.expiresAt <= this.now()) return false;
    this.limit('queued-sender:' + sender, 120, 60000);
    this.limit(
      'queued-pair:' + event.kind + ':' + sender + ':' + recipient,
      event.kind === 'call' ? 6 : 30,
      60000,
    );
    this.limit(
      'queued-recipient:' + event.kind + ':' + recipient,
      event.kind === 'call' ? 12 : 60,
      60000,
    );
    const route = this.registry.ownerRoute(recipient, event.kind === 'call' ? 'voip' : 'alert');
    if (!route) return false;
    if (this.inFlight >= 32) throw new Error('PUSH_RATE_LIMITED');
    this.inFlight++;
    try {
      const result = await this.provider.send(route, event, {
        ...options,
        ...(event.kind === 'call'
          ? { callerHint: createHash('sha256').update(sender).digest('hex') }
          : {}),
      });
      if (result.invalidatedAt !== undefined) this.registry.invalidate(route, result.invalidatedAt);
      return result.accepted;
    } finally {
      this.inFlight--;
    }
  }
  async execute(key: string, command: PhoneCommand) {
    if (command.action === 'push-disable') {
      this.registry.disable(key);
      return;
    }
    if (command.action === 'push-register') {
      if (this.provider.available && !this.provider.available(command.registration))
        throw new Error('PUSH_UNAVAILABLE');
      const current = this.registry.ownerRoute(key, command.registration.channel);
      const unchanged =
        current?.token === command.registration.token &&
        current.environment === command.registration.environment &&
        current.platform === command.registration.platform;
      // Reopening the same installation confirms its existing route. Only new
      // registrations or token changes consume the mutation quota; ownership
      // checks and the authenticated HTTP request limits still apply.
      if (!unchanged) this.limit('register:' + key, 30, 3600000);
      this.registry.register(key, command.registration, this.now());
      return;
    }
    if (command.action === 'wake-grant') {
      this.limit('grant:' + key, 1200, 3600000);
      this.registry.grant(key, command.capability, this.now());
      return;
    }
    if (command.action === 'wake-revoke') {
      this.registry.revoke(key, command.capability);
      return;
    }
    if (command.action !== 'wake') throw new Error('PUSH_REQUEST_INVALID');
    this.limit('send:' + key, 120, 60000);
    const capabilityHash = createHash('sha256').update(command.capability).digest('hex');
    this.limit(
      'cap:' + command.event.kind + ':' + capabilityHash,
      command.event.kind === 'call' ? 6 : 30,
      60000,
    );
    for (const [id, expires] of this.seen) if (expires <= this.now()) this.seen.delete(id);
    const event = capabilityHash + ':' + command.event.kind + ':' + command.event.id;
    if (this.seen.has(event)) return;
    if (this.seen.size >= 10000) throw new Error('PUSH_RATE_LIMITED');
    const route = this.registry.route(
      command.capability,
      command.event.kind === 'call' ? 'voip' : 'alert',
      this.now(),
    );
    // No recipient/token or registration enumeration through API responses.
    if (!route || (this.canContact && !this.canContact(key, route.owner))) return;
    this.limit(
      'recipient:' + command.event.kind + ':' + route.owner,
      command.event.kind === 'call' ? 12 : 60,
      60000,
    );
    if (this.inFlight >= 32) throw new Error('PUSH_RATE_LIMITED');
    this.inFlight++;
    this.seen.set(event, this.now() + 120000);
    try {
      const result = await this.provider.send(
        route,
        command.event,
        command.event.kind === 'call'
          ? {
              expiresAt: this.now() + 60000,
              callerHint: createHash('sha256').update(key).digest('hex'),
            }
          : undefined,
      );
      if (result.invalidatedAt !== undefined) this.registry.invalidate(route, result.invalidatedAt);
    } catch (error) {
      this.seen.delete(event);
      throw error;
    } finally {
      this.inFlight--;
    }
  }
}
