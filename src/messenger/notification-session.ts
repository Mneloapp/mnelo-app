import { DeviceMessenger } from './engine';
import { enrollmentAllowsAccess } from './enrollment';
import { SignalJournal } from './delivery/journal';
import { scheduledPhoneClient } from './phone-client';
import type { ShareHost } from './share-extension';
import {
  notificationText,
  notificationBadgeCount,
  readNotificationPreview,
  type NotificationPreview,
} from './notification-preview';
import { z } from 'zod';

export type NotificationHost = Pick<
  ShareHost,
  'db' | 'random' | 'uuid' | 'signal' | 'request' | 'savedContacts'
>;

// A notification extension may decrypt into the durable inbox and send a delivery
// receipt. It never marks read, projects messages, sends user content, creates an
// identity or publishes keys. Server deletion waits for normal app projection.
// The app later projects that inbox using its ordinary crash-safe delivery path.
export class NotificationSession {
  private readonly engine: DeviceMessenger;
  constructor(private readonly host: NotificationHost) {
    this.engine = new DeviceMessenger(host.db, host.random, host.uuid);
  }
  async preview(id: string, language = 'en') {
    if (!z.string().uuid().safeParse(id).success) return null;
    const versions = await this.host.db.all<{ user_version: number }>('PRAGMA user_version');
    if (versions[0]?.user_version !== 6) return null;
    await this.engine.initialize();
    const own = this.engine.currentIdentity(),
      enrollment = this.engine.currentEnrollment();
    const service = process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL;
    if (
      !own ||
      !enrollment ||
      !service ||
      this.engine.currentDeliveryVersion() !== 2 ||
      !enrollmentAllowsAccess(own, enrollment, service, process.env.EXPO_PUBLIC_APP_ENV)
    )
      return null;
    const read = (incoming?: { sender: string; body: string }) =>
      readNotificationPreview(this.engine.deliveryAtomic, own.key, id, incoming);
    let preview = await read();
    if (!preview) {
      const state = await this.host.db.all<{ owner: string }>(
        'SELECT owner FROM signal_state WHERE singleton=1',
      );
      if (state[0]?.owner !== own.key) return null;
      const journal = new SignalJournal(this.engine.deliveryAtomic, this.host.signal, own);
      await journal.initialize();
      const client = scheduledPhoneClient(service, own, this.host.request, 3000);
      let received: { sender: string; id: string } | undefined;
      const pending = await this.host.db.all<{ sender: string; body: string; id: string }>(
        'SELECT sender,body,id FROM signal_inbox WHERE applied=0 ORDER BY created_at DESC LIMIT 40',
      );
      for (const row of pending) {
        preview = await read(row);
        if (preview) {
          received = row;
          break;
        }
      }
      if (!preview) {
        const contacts = await this.engine.contacts();
        let after: { acceptedAt: number; sender: string; id: string } | undefined;
        for (let page = 0; page < 2 && !preview; page++) {
          const inbox = (
            await client.execute({ action: 'delivery-inbox', ...(after ? { after } : {}) })
          ).delivery?.inbox;
          if (!inbox?.length) break;
          for (const envelope of inbox) {
            if (envelope.notify?.kind !== 'message' || envelope.notify.id !== id) continue;
            // First-contact/blocked senders keep the generic system alert until
            // the containing app verifies their phone and accepts the contact.
            if (
              !contacts.some(
                (contact) => contact.key === envelope.sender && contact.phone && !contact.blocked,
              )
            )
              return null;
            if (!(await journal.known(envelope.sender))) {
              const identity = (
                await client.execute({ action: 'delivery-identity', peer: envelope.sender })
              ).delivery?.identity;
              if (!identity) return null;
              await journal.pin(identity);
            }
            await journal.receive(envelope);
            const row = (
              await this.host.db.all<{ sender: string; body: string }>(
                'SELECT sender,body FROM signal_inbox WHERE sender=? AND id=? AND applied=0',
                envelope.sender,
                envelope.id,
              )
            )[0];
            preview = row ? await read(row) : await read();
            if (row && preview) received = envelope;
            break;
          }
          const last = inbox[inbox.length - 1]!;
          after = { acceptedAt: last.acceptedAt, sender: last.sender, id: last.id };
        }
      }
      if (preview && received) {
        try {
          const receipt = await journal.received(received.sender, received.id, {
            id: this.host.uuid(),
            body: JSON.stringify({
              version: 2,
              phone: enrollment.phone,
              name: own.name,
              packet: { type: 'ack', id: preview.id },
            }),
          });
          // Decryption has already established this pinned Signal session. Do
          // not publish/request keys or drain unrelated messages from the NSE.
          if (receipt && !(await journal.needsBundle(receipt.peer))) {
            const envelope = await journal.seal(receipt.id);
            const result = await client.execute({ action: 'delivery-submit', envelope });
            if (result.delivery?.accepted) await journal.uploaded(receipt.id);
          }
        } catch {
          // The ordinary app pump retries the durable encrypted receipt after
          // interruption/offline/expiry; notification text remains available.
        }
      }
    }
    return preview ? this.present(preview, enrollment.phone, language) : null;
  }
  private async present(preview: NotificationPreview, ownNumber: string, language: string) {
    const names = await this.engine.contactDisplayNames();
    const saved = await this.host
      .savedContacts(preview.phone ? [preview.phone] : [], ownNumber)
      .catch(() => new Map());
    const name = saved.get(preview.phone)?.name ?? names.get(preview.sender) ?? preview.name;
    const chat = await this.engine.chat(preview.chat);
    return {
      id: preview.id,
      chat: preview.chat,
      title: chat?.kind === 'group' ? `${name} · ${chat.title}` : name,
      body: notificationText(preview, language),
      badge: await notificationBadgeCount(
        this.engine.deliveryAtomic,
        this.engine.currentIdentity()!.key,
      ),
    };
  }
  async close() {
    await this.engine.close();
  }
}
