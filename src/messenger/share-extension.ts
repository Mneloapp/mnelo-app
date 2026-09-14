import { DeviceMessenger, type ChatCursor } from './engine';
import { ContactView } from './contact-view';
import { ApplicationDelivery } from './delivery/application';
import type { SignalProvider } from './delivery/signal';
import { PhoneClient } from './phone-client';
import { enrollmentAllowsAccess } from './enrollment';
import { bytesToHex } from './crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import type { LocalDatabase, Media } from './model';

export type ShareItem = { kind: 'text'; text: string } | { kind: 'image' | 'file'; media: Media };
export type ShareHost = {
  db: LocalDatabase;
  random: (count: number) => Uint8Array;
  uuid: () => string;
  signal: SignalProvider;
  request: typeof fetch;
  item: (index: number) => ShareItem;
  count: number;
};

// The extension uses the same encrypted vault, transactions, protocol and media
// journal as the app. It never generates a second device or consumes the inbox.
export class ShareSession {
  private readonly engine: DeviceMessenger;
  private delivery: ApplicationDelivery | null = null;
  private readonly committed: string[] = [];
  private recipient: string | null = null;
  private busy = false;
  private state = 'starting';
  constructor(private readonly host: ShareHost) {
    this.engine = new DeviceMessenger(host.db, host.random, host.uuid);
  }
  async open() {
    const versions = await this.host.db.all<{ user_version: number }>('PRAGMA user_version');
    // Only the containing app migrates the schema and registers this device.
    if (versions[0]?.user_version !== 6) throw new Error('SHARE_OPEN_MNELO_FIRST');
    await this.engine.initialize();
    const identity = this.engine.currentIdentity();
    const service = process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL;
    if (
      !enrollmentAllowsAccess(
        identity,
        this.engine.currentEnrollment(),
        service,
        process.env.EXPO_PUBLIC_APP_ENV,
      ) ||
      !identity ||
      !service
    )
      throw new Error('SHARE_OPEN_MNELO_FIRST');
    const delivery = new ApplicationDelivery(
      this.engine,
      new PhoneClient(service, identity, this.host.request),
      this.host.signal,
      this.host.random,
      this.host.uuid,
      (state) => {
        this.state = state;
      },
      async () => null,
      Date.now,
      true,
    );
    await delivery.initialize();
    this.delivery = delivery;
    this.engine.attachTransport({
      send: () => false,
      sendDurable: (peer, packet, event) => delivery.sendDurable(peer, packet, event),
      stop: () => delivery.stop(),
    });
    const view = new ContactView(
      this.engine,
      new Map((await this.engine.contacts()).map((contact) => [contact.key, contact.name])),
    );
    const result: { id: string; title: string; group: boolean }[] = [];
    let cursor: ChatCursor | undefined;
    const blocked = new Set(
      (await this.engine.contacts())
        .filter((contact) => contact.blocked)
        .map((contact) => contact.key),
    );
    do {
      const page = await view.chatPage('all', '', cursor);
      for (const chat of page.rows) {
        const members = await this.engine.members(chat.id);
        if (
          !chat.left_group &&
          members.length > 1 &&
          members.some((member) => member.key === identity.key) &&
          !members.some((member) => blocked.has(member.key))
        )
          result.push({ id: chat.id, title: chat.title, group: chat.kind === 'group' });
      }
      cursor = page.next;
    } while (cursor && result.length < 1000);
    return result;
  }
  private async uploaded() {
    if (!this.committed.length) return false;
    return this.engine.deliveryAtomic(async (db) => {
      for (const id of this.committed) {
        const event = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(['message', id]))));
        const peers = await db.all<{ peer: string }>(
          'SELECT peer FROM deliveries WHERE message_id=?',
          id,
        );
        if (!peers.length) return false;
        for (const { peer } of peers) {
          const token = bytesToHex(
            sha256(new TextEncoder().encode(JSON.stringify([peer, ['event', event]]))),
          );
          if (
            !(
              await db.all<{ uploaded: number }>(
                'SELECT uploaded FROM signal_outbox WHERE token=?',
                token,
              )
            )[0]?.uploaded
          )
            return false;
        }
      }
      return true;
    });
  }
  async send(recipient: string) {
    if (this.busy || !this.delivery) throw new Error('SHARE_BUSY');
    if (this.recipient && this.recipient !== recipient) throw new Error('SHARE_RECIPIENT_LOCKED');
    if (this.host.count < 1 || this.host.count > 10) throw new Error('SHARE_TOO_MANY');
    this.busy = true;
    this.recipient = recipient;
    let failure = '';
    try {
      // Read only one attachment at a time; retry starts after committed items.
      for (let index = this.committed.length; index < this.host.count; index++) {
        const item = this.host.item(index);
        const id =
          item.kind === 'text'
            ? await this.engine.send(recipient, item.text, { deferDelivery: true })
            : await this.engine.send(recipient, '', {
                kind: item.kind,
                media: item.media,
                deferDelivery: true,
              });
        this.committed.push(id);
        await this.engine.flush(undefined, id).catch(() => undefined);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : 'SHARE_FAILED';
    }
    try {
      if (this.committed.length) {
        await this.delivery.start();
        const deadline = Date.now() + 22000;
        do {
          await this.delivery.pump.tick();
          if (await this.uploaded()) break;
        } while (Date.now() < deadline && this.state === 'ready');
      }
      const uploaded = await this.uploaded();
      return { committed: this.committed.length, total: this.host.count, uploaded, failure };
    } finally {
      this.delivery.pump.stop();
      this.busy = false;
    }
  }
  async close() {
    this.delivery?.stop();
    await this.engine.close();
  }
}
