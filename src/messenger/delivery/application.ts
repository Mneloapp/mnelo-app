import { connectionTiming } from '../connection-timing';
import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, type RandomBytes } from '../crypto';
import type { DeviceMessenger } from '../engine';
import { packetSchema, type Packet } from '../model';
import { internationalPhone } from '../phone-protocol';
import type { PhoneClient } from '../phone-client';
import { bytesToBase64 } from './media-crypto';
import { privateMediaDescriptor } from './media-schema';
import { MediaJournal } from './media-journal';
import { MediaTransfer } from './media-transfer';
import { SignalJournal } from './journal';
import { DeliveryPump, type DeliveryState } from './pump';
import type { SignalProvider } from './signal';
import { signedSignal, readSignal } from '../signaling';
import type { CallControl } from '../calls';
import { localProfile } from '../local-profile';

const applicationPacket = z.union([
  packetSchema,
  z.object({ type: z.literal('call-signal'), envelope: signedSignal }).strict(),
  z
    .object({
      type: z.literal('profile'),
      revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      profile: localProfile,
    })
    .strict(),
]);
type ApplicationPacket = z.infer<typeof applicationPacket>;
export type DeliveryCallReceiver = {
  ringingReceipt?: (peer: string, id: string) => Promise<void>;
  recover?: () => Promise<void>;
  control: (
    peer: string,
    control: CallControl,
    context: { id: string; createdAt: number },
  ) => Promise<void>;
  signal: (peer: string, envelope: z.infer<typeof signedSignal>) => Promise<void>;
};

export const deliveryContent = z
  .object({
    version: z.literal(2),
    phone: internationalPhone,
    name: z.string().trim().min(1).max(60),
    packet: applicationPacket,
    attachment: z
      .object({
        descriptor: privateMediaDescriptor,
        name: z.string().min(1).max(180),
        mime: z.string().max(100),
        duration: z.number().min(0).max(3600).nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.packet.type === 'message' && value.packet.media !== null)
      ctx.addIssue({ code: 'custom', message: 'INLINE_MEDIA_FORBIDDEN' });
    if (
      value.attachment &&
      (value.packet.type !== 'message' ||
        !['image', 'file', 'voice'].includes(value.packet.kind) ||
        value.packet.sentAt !== value.attachment.descriptor.blob.createdAt)
    )
      ctx.addIssue({ code: 'custom', message: 'MEDIA_BINDING_INVALID' });
  });
const content = deliveryContent;
const applicationEventKey = (packet: ApplicationPacket) =>
  bytesToHex(
    sha256(
      new TextEncoder().encode(
        JSON.stringify(packet.type === 'message' ? ['message', packet.id] : packet),
      ),
    ),
  );

// Application adapter above the vendor protocol. No crypto keys or plaintext
// application content are sent to the delivery API outside a Signal envelope.
export class ApplicationDelivery {
  calls: DeliveryCallReceiver | null = null;
  readonly journal: SignalJournal;
  readonly media: MediaJournal;
  readonly transfer: MediaTransfer;
  readonly pump: DeliveryPump;
  private ready: Promise<void> | null = null;
  private stopped = false;
  private readonly owner: string;
  constructor(
    private readonly engine: DeviceMessenger,
    private readonly client: Pick<PhoneClient, 'execute'>,
    signal: SignalProvider,
    random: RandomBytes,
    private readonly uuid: () => string,
    changed: (state: DeliveryState) => void,
    private readonly savedName: (phone: string) => Promise<string | null>,
    private readonly now = Date.now,
    outgoingOnly = false,
    outgoingTokens?: () => Promise<readonly string[]>,
  ) {
    const own = engine.currentIdentity();
    if (!own) throw new Error('IDENTITY_REQUIRED');
    this.owner = own.key;
    this.journal = new SignalJournal(engine.deliveryAtomic, signal, own, now);
    this.media = new MediaJournal(engine.deliveryAtomic, own.key, random, uuid, now);
    this.transfer = new MediaTransfer(client, this.media, () => this.pump.wake());
    this.pump = new DeliveryPump(
      client,
      this.journal,
      (sender, body, context, yieldToCalls) => this.receive(sender, body, context, yieldToCalls),
      changed,
      now,
      {
        outgoingOnly,
        ...(outgoingTokens ? { outgoingTokens } : {}),
        beforeCycle: async () => {
          if (outgoingOnly) return;
          await this.calls?.recover?.();
          for (const row of await engine.deliveryBlocks()) {
            const result = await client.execute({
              action: 'delivery-block',
              peer: row.peer,
              blocked: Boolean(row.blocked),
            });
            if (!result.delivery?.ok) throw new Error('DELIVERY_RESPONSE_INVALID');
            await engine.deliveryBlockApplied(row.peer, row.revision);
          }
          const shares = await engine.profileShares();
          for (const { peer } of shares.peers) {
            if (
              await this.sendApplication(
                peer,
                { type: 'profile', revision: shares.revision, profile: shares.profile },
                undefined,
                false,
              )
            )
              await engine.profileShared(peer, shares.revision);
          }
        },
        beforeSend: async (peer, body, yieldToCalls) => {
          if (!(await engine.acceptsPeer(peer))) return false;
          const value = content.parse(JSON.parse(body));
          return value.attachment
            ? this.transfer.uploadStep(value.attachment.descriptor.blob.id, yieldToCalls)
            : true;
        },
        afterCycle: async (yieldToCalls) => {
          if (!outgoingOnly) await this.transfer.acknowledge(yieldToCalls);
          await this.media.prune();
        },
      },
    );
  }
  initialize() {
    if (!this.ready)
      this.ready = (async () => {
        // An older app must not open a vault after its session ratchets have
        // migrated, even if a caller installs an earlier development binary.
        await this.engine.enableSignalDelivery();
        await this.journal.initialize();
        await this.media.initialize();
      })();
    return this.ready;
  }
  async start() {
    await this.initialize();
    if (!this.stopped) this.pump.start();
  }
  stop() {
    this.stopped = true;
    this.pump.stop();
  }
  private wrap(packet: ApplicationPacket) {
    const own = this.engine.currentIdentity(),
      enrollment = this.engine.currentEnrollment();
    if (!own || !enrollment) throw new Error('PHONE_REGISTRATION_REQUIRED');
    return { version: 2 as const, phone: enrollment.phone, name: own.name, packet };
  }
  async sendDurable(peer: string, input: Packet, event?: { id: string; createdAt: number }) {
    return this.sendApplication(peer, input, event);
  }
  async waitForCallUpload(peer: string, input: CallControl, timeoutMs = 8000) {
    const packet = applicationPacket.parse(input);
    if (packet.type !== 'call' || !['end', 'decline'].includes(packet.action))
      throw new Error('CALL_TERMINAL_REQUIRED');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
      throw new Error('CALL_UPLOAD_TIMEOUT_INVALID');
    const event = applicationEventKey(packet);
    // Enqueueing a terminal is crash-safe, but is not proof that the other
    // device can receive it. Keep the native background assertion until this
    // exact encrypted event has been accepted by the server. No second pump,
    // re-encryption, acknowledgement, or deletion occurs on timeout.
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        if (pollTimer) clearTimeout(pollTimer);
        if (error) reject(error);
        else resolve();
      };
      const deadline = setTimeout(() => finish(new Error('CALL_UPLOAD_TIMEOUT')), timeoutMs);
      const current = () => !this.stopped && this.engine.currentIdentity()?.key === this.owner;
      const poll = async () => {
        if (finished) return;
        if (!current()) throw new Error('DELIVERY_STOPPED');
        const uploaded = await this.journal.eventUploaded(peer, event);
        if (finished) return;
        if (!current()) throw new Error('DELIVERY_STOPPED');
        if (uploaded === null) throw new Error('CALL_TERMINAL_NOT_QUEUED');
        if (uploaded) finish();
        else pollTimer = setTimeout(() => void poll().catch(finish), 100);
      };
      this.pump.wake();
      void poll().catch(finish);
    });
  }
  async sendSignal(peer: string, envelope: z.infer<typeof signedSignal>) {
    if (!(await this.sendApplication(peer, { type: 'call-signal', envelope })))
      throw new Error('CALL_UNAVAILABLE');
  }
  async sendRingingReceipt(peer: string, id: string) {
    if (!(await this.sendApplication(peer, { type: 'ack', id }, undefined, true, true)))
      throw new Error('CALL_UNAVAILABLE');
  }
  private async sendApplication(
    peer: string,
    input: ApplicationPacket,
    event?: { id: string; createdAt: number },
    wake = true,
    urgent = false,
  ) {
    await this.initialize();
    if (this.stopped || !(await this.engine.acceptsPeer(peer))) return false;
    const packet = applicationPacket.parse(input);
    const createdAt = packet.type === 'message' ? packet.sentAt : (event?.createdAt ?? this.now());
    const stable = event?.id ?? applicationEventKey(packet);
    // A flush already in flight when a receipt cleans up its file must not
    // generate another object/key for the same application event.
    if (await this.journal.hasEvent(peer, stable)) return true;
    let value: z.infer<typeof content> = this.wrap(packet);
    if (packet.type === 'message' && packet.media) {
      const descriptor = await this.media.prepare(peer, packet.id, createdAt, packet.media);
      const { bytes: _bytes, ...metadata } = packet.media;
      value = {
        ...value,
        packet: { ...packet, media: null },
        attachment: { descriptor, ...metadata },
      };
    }
    await this.journal.enqueue(
      peer,
      this.uuid(),
      JSON.stringify(content.parse(value)),
      createdAt,
      stable,
      packet.type === 'message'
        ? { kind: 'message', id: packet.id }
        : packet.type === 'call' && packet.action === 'invite'
          ? { kind: 'call', id: packet.id, video: packet.media === 'video' }
          : undefined,
      urgent || packet.type === 'call' || packet.type === 'call-signal'
        ? 3
        : packet.type === 'message'
          ? 0
          : ['ack', 'group_ack', 'read', 'read_ids'].includes(packet.type)
            ? 2
            : 1,
    );
    if (wake) this.pump.wake();
    return true;
  }
  async receive(
    sender: string,
    body: string,
    context: { id: string; createdAt: number },
    yieldToCalls?: () => Promise<void>,
  ) {
    const value = content.parse(JSON.parse(body));
    const contacts = await this.engine.contacts();
    const known = contacts.find((contact) => contact.key === sender);
    if (known?.blocked) return false;
    if (!known?.phone) {
      // Unknown people may introduce a message, not forge a read/reaction to
      // manufacture an address-book entry. Existing blocked pins always win.
      if (!known && !['message', 'group', 'call'].includes(value.packet.type)) return false;
      const verified = (
        await this.client.execute({
          action: 'delivery-verify-sender',
          peer: sender,
          id: context.id,
          phone: value.phone,
        })
      ).delivery?.verified;
      if (!verified) throw new Error('PHONE_IDENTITY_CHANGED');
      const name = await this.savedName(value.phone).catch(() => null);
      await this.engine.trustPhoneContact({
        key: sender,
        phone: value.phone,
        name: name ?? value.name,
      });
    } else if (known.phone !== value.phone) throw new Error('PHONE_IDENTITY_CHANGED');
    let packet = value.packet;
    if (packet.type === 'profile') {
      await this.engine.receiveProfile(sender, packet.profile, packet.revision);
      return {};
    }
    if (value.attachment) {
      if (packet.type !== 'message') throw new Error('MEDIA_BINDING_INVALID');
      const { descriptor, ...metadata } = value.attachment;
      if (descriptor.owner !== sender) throw new Error('MEDIA_UNAUTHORIZED');
      await this.media.beginDownload(descriptor);
      if (!(await this.engine.hasReceivedMessage(sender, packet.id))) {
        if (!(await this.transfer.downloadStep(sender, descriptor, yieldToCalls))) return false;
        const bytes = await this.media.plaintext(sender, descriptor.blob.id);
        packet = { ...packet, media: { ...metadata, bytes: bytesToBase64(bytes) } };
      }
    }
    if (packet.type === 'call') {
      if (!this.calls) return false;
      await this.calls.control(sender, packet, context);
      return {};
    }
    if (packet.type === 'call-signal') {
      if (!this.calls) return false;
      const signal = readSignal(packet.envelope, this.engine.currentIdentity()!.key, this.now());
      if (!signal) return {}; // Expired SDP cannot reconnect a historical call.
      if (signal.from !== sender || signal.purpose !== 'call')
        throw new Error('CALL_SIGNAL_INVALID');
      await this.calls.signal(sender, packet.envelope);
      return {};
    }
    if (packet.type === 'ack') await this.calls?.ringingReceipt?.(sender, packet.id);
    if (!(await this.engine.receive(sender, packet, { sendReceipts: false }))) return false;
    if (packet.type === 'message') connectionTiming('MESSAGE_PROJECTED');
    if (packet.type === 'ack') connectionTiming('DELIVERY_CONFIRMED');
    if (packet.type === 'read_ids' || packet.type === 'read') connectionTiming('READ_CONFIRMED');
    if (value.attachment) await this.media.consumed(sender, value.attachment.descriptor.blob.id);
    const receipt: Packet | null =
      packet.type === 'message'
        ? { type: 'ack', id: packet.id }
        : packet.type === 'group'
          ? { type: 'group_ack', id: packet.id, revision: packet.revision }
          : null;
    return receipt
      ? { receipt: { id: this.uuid(), body: JSON.stringify(this.wrap(receipt)) } }
      : {};
  }
}
