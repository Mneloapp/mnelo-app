import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { DeviceMessenger } from './engine';
import { ApplicationDelivery, deliveryContent } from './delivery/application';
import { DeliveredCallControl } from './delivery/call-control';
import { enrollmentAllowsAccess } from './enrollment';
import { bytesToHex, hexToBytes, directChatId } from './crypto';
import { scheduledPhoneClient } from './phone-client';
import { peerKey, type LocalDatabase } from './model';
import type { ShareHost } from './share-extension';

const selectorSchema = z
  .object({
    callId: z.string().uuid(),
    handle: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
    callerHint: peerKey,
    accountHint: peerKey,
    receivedAt: z.number().finite().nonnegative().max(8640000000000000),
  })
  .strict();
const requestSchema = z
  .object({
    handle: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
    account: peerKey.optional(),
    peer: peerKey.optional(),
    callId: z.string().uuid().optional(),
    displayName: z.string().max(256).optional(),
    conversation: z.string().max(128).optional(),
    identifier: z.string().max(256).optional(),
    selector: selectorSchema.optional(),
    content: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();
type Request = z.infer<typeof requestSchema>;
export type IntentRecipient = {
  account: string;
  peer: string;
  callId: string;
  handle: string;
  displayName: string;
  conversation: string;
};
type IntentHost = Pick<ShareHost, 'db' | 'random' | 'uuid' | 'signal' | 'request'>;
const hash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
function messageId(binding: IntentRecipient, content: string, secret: string) {
  // Public call IDs plus common quick-reply text must not create a guessable
  // plaintext fingerprint in the message ID exposed to the delivery server.
  const value = bytesToHex(
    hmac(
      sha256,
      hexToBytes(secret),
      new TextEncoder().encode(
        JSON.stringify([
          'mnelo-call-reply-v1',
          binding.account,
          binding.peer,
          binding.callId,
          content,
        ]),
      ),
    ),
  );
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

// The OS intent can reply only to a recent authenticated incoming direct call.
// No contacts discovery, app launch, fresh identity or key lookup. A cold native
// selector may inspect two ciphertext pages and decrypt only its exact call.
// A committed message survives an extension timeout; only server acceptance is success.
export class IntentMessageSession {
  private readonly engine: DeviceMessenger;
  private delivery: ApplicationDelivery | null = null;
  private ready: Promise<void> | null = null;
  private closed = false;
  private busy = false;
  private requestScope: Request | null = null;
  private requests = new Set<AbortController>();
  constructor(
    private readonly host: IntentHost,
    private readonly now = Date.now,
  ) {
    this.engine = new DeviceMessenger(host.db, host.random, host.uuid, now);
  }
  private alive() {
    if (this.closed) throw new Error('INTENT_CLOSED');
  }
  private initialize() {
    this.alive();
    return (this.ready ??= (async () => {
      const versions = await this.host.db.all<{ user_version: number }>('PRAGMA user_version');
      if (versions[0]?.user_version !== 6) throw new Error('INTENT_OPEN_MNELO_FIRST');
      await this.engine.initialize();
      const own = this.engine.currentIdentity(),
        service = process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL;
      if (
        !own ||
        !service ||
        !enrollmentAllowsAccess(
          own,
          this.engine.currentEnrollment(),
          service,
          process.env.EXPO_PUBLIC_APP_ENV,
        )
      )
        throw new Error('INTENT_OPEN_MNELO_FIRST');
      const state = await this.host.db.all<{ owner: string }>(
        'SELECT owner FROM signal_state WHERE singleton=1',
      );
      if (state[0]?.owner !== own.key) throw new Error('INTENT_OPEN_MNELO_FIRST');
      this.alive();
    })());
  }
  private parse(input: unknown) {
    const value = requestSchema.parse(input);
    if (value.content && new TextEncoder().encode(value.content).length > 8000)
      throw new Error('INTENT_CONTENT_INVALID');
    return value;
  }
  private async recipient(
    db: LocalDatabase,
    input: Request,
  ): Promise<Omit<IntentRecipient, 'callId'>> {
    this.alive();
    const own = this.engine.currentIdentity(),
      enrollment = this.engine.currentEnrollment();
    const account = (
      await db.all<{
        key: string;
        phone: string;
        service: string;
        testOnly: number;
        verifiedAt: number;
      }>(
        'SELECT i.public_key AS key,r.phone,e.service,e.test_only AS testOnly,e.verified_at AS verifiedAt FROM identity i JOIN phone_registration r USING(singleton) JOIN phone_enrollment e USING(singleton) WHERE i.singleton=1',
      )
    )[0];
    if (
      !own ||
      !account ||
      account.key !== own.key ||
      enrollment?.phone !== account.phone ||
      !enrollmentAllowsAccess(
        own,
        { ...account, testOnly: Boolean(account.testOnly) },
        process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
        process.env.EXPO_PUBLIC_APP_ENV,
      ) ||
      (input.account && input.account !== account.key)
    )
      throw new Error('INTENT_ACCOUNT_CHANGED');
    const contacts = await db.all<{ peer: string; name: string }>(
      'SELECT c.public_key AS peer,c.name FROM contacts c JOIN contact_numbers n USING(public_key) WHERE n.phone=? AND c.blocked=0 LIMIT 2',
      input.handle,
    );
    const contact = contacts[0];
    if (
      contacts.length !== 1 ||
      !contact ||
      contact.peer === own.key ||
      (input.peer && input.peer !== contact.peer)
    )
      throw new Error('INTENT_RECIPIENT_UNAVAILABLE');
    const conversation = directChatId(own.key, contact.peer);
    const chats = await db.all(
      "SELECT id FROM chats WHERE id=? AND kind='direct' AND left_group=0",
      conversation,
    );
    const members = await db.all<{ public_key: string }>(
      'SELECT public_key FROM members WHERE chat_id=?',
      conversation,
    );
    if (
      !chats.length ||
      members.length !== 2 ||
      !members.some((row) => row.public_key === own.key) ||
      !members.some((row) => row.public_key === contact.peer)
    )
      throw new Error('INTENT_RECIPIENT_UNAVAILABLE');
    const selector = input.selector;
    const hint = (key: string) => bytesToHex(sha256(new TextEncoder().encode(key)));
    if (
      selector &&
      (selector.handle !== input.handle ||
        selector.accountHint !== hint(own.key) ||
        selector.callerHint !== hint(contact.peer) ||
        (input.callId && input.callId !== selector.callId) ||
        selector.receivedAt > this.now() ||
        this.now() - selector.receivedAt > 120000)
    )
      throw new Error('INTENT_CALL_UNAVAILABLE');
    return {
      account: own.key,
      peer: contact.peer,
      handle: input.handle,
      displayName: contact.name || input.handle,
      conversation,
    };
  }
  private async binding(db: LocalDatabase, input: Request): Promise<IntentRecipient> {
    const recipient = await this.recipient(db, input);
    const { peer, conversation } = recipient;
    const callId = input.callId ?? input.selector?.callId;
    const calls: string[] = [];
    const hasInvites =
      (
        await db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='delivered_call_invites'",
        )
      ).length > 0;
    if (hasInvites) {
      const ringing = await db.all<{ id: string }>(
        `SELECT id FROM delivered_call_invites WHERE peer=? AND phase='incoming' AND group_context IS NULL AND created_at>=? AND created_at<=? ${callId ? 'AND id=?' : ''} LIMIT 2`,
        peer,
        this.now() - 60000,
        this.now(),
        ...(callId ? [callId] : []),
      );
      calls.push(...ringing.map((row) => row.id));
    }
    // A native Message action can end CallKit before its intent is resolved.
    // Do not accept answered, missed, outgoing, group or expired call records.
    const declined = await db.all<{ id: string }>(
      `SELECT id FROM messages WHERE chat_id=? AND sender=? AND kind='call' AND body IN ('voice:incoming:declined','video:incoming:declined') AND received_at>=? AND received_at<=? ${callId ? 'AND id=?' : ''} LIMIT 2`,
      conversation,
      peer,
      this.now() - 120000,
      this.now(),
      ...(callId ? [callId] : []),
    );
    calls.push(...declined.map((row) => row.id));
    const unique = [...new Set(calls)];
    if (unique.length !== 1 || !unique[0] || !z.string().uuid().safeParse(unique[0]).success)
      throw new Error('INTENT_CALL_UNAVAILABLE');
    return { ...recipient, callId: unique[0] };
  }
  async resolve(input: unknown) {
    const request = this.parse(input);
    await this.initialize();
    try {
      return await this.engine.deliveryAtomic((db) => this.binding(db, request));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'INTENT_CALL_UNAVAILABLE' ||
        !request.selector
      )
        throw error;
      await this.recoverInvite(request);
      return this.engine.deliveryAtomic((db) =>
        this.binding(db, { ...request, callId: request.callId ?? request.selector!.callId }),
      );
    }
  }
  private async recoverInvite(request: Request) {
    const selector = request.selector!;
    const recipient = await this.engine.deliveryAtomic((db) => this.recipient(db, request));
    const own = this.engine.currentIdentity()!;
    const client = scheduledPhoneClient(
      process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL!,
      own,
      this.request,
      1500,
    );
    const delivery = (this.delivery ??= new ApplicationDelivery(
      this.engine,
      client,
      this.host.signal,
      this.host.random,
      this.host.uuid,
      () => {},
      async () => null,
      this.now,
      true,
    ));
    await delivery.initialize();
    if (!(await delivery.journal.known(recipient.peer))) throw new Error('INTENT_CALL_UNAVAILABLE');
    const accept = async (body: string, createdAt: number) => {
      let parsed;
      try {
        parsed = deliveryContent.safeParse(JSON.parse(body));
      } catch {
        return false;
      }
      if (!parsed.success) return false;
      const value = parsed.data,
        packet = value.packet;
      if (
        value.phone !== request.handle ||
        packet.type !== 'call' ||
        packet.action !== 'invite' ||
        packet.id !== selector.callId ||
        packet.group ||
        createdAt > this.now() ||
        this.now() - createdAt >= 60000
      )
        return false;
      await this.engine.deliveryAtomic((db) => this.recipient(db, request));
      await new DeliveredCallControl(this.engine, { receive: async () => {} }, this.now).receive(
        recipient.peer,
        packet,
        { createdAt },
      );
      return true;
    };
    const local = await this.engine.deliveryAtomic((db) =>
      db.all<{ body: string; created_at: number }>(
        'SELECT body,created_at FROM signal_inbox WHERE sender=? AND applied=0 ORDER BY created_at DESC LIMIT 40',
        recipient.peer,
      ),
    );
    for (const row of local) if (await accept(row.body, row.created_at)) return;
    this.requestScope = request;
    try {
      let after: { acceptedAt: number; sender: string; id: string } | undefined;
      const deadline = this.now() + 5500;
      for (let page = 0; page < 2 && this.now() < deadline; page++) {
        const inbox = (
          await client.execute({ action: 'delivery-inbox', ...(after ? { after } : {}) }, true)
        ).delivery?.inbox;
        this.alive();
        if (!inbox?.length) break;
        for (const envelope of inbox) {
          if (
            envelope.sender !== recipient.peer ||
            envelope.notify?.kind !== 'call' ||
            envelope.notify.id !== selector.callId
          )
            continue;
          await this.engine.deliveryAtomic((db) => this.recipient(db, request));
          // Persist plaintext/ratchet together even if the purported call does
          // not match. Normal app projection still owns every ACK and deletion.
          await delivery.journal.receive(envelope);
          const row = (
            await this.engine.deliveryAtomic((db) =>
              db.all<{ body: string; created_at: number }>(
                'SELECT body,created_at FROM signal_inbox WHERE sender=? AND id=?',
                recipient.peer,
                envelope.id,
              ),
            )
          )[0];
          if (row && (await accept(row.body, row.created_at))) return;
        }
        const last = inbox.at(-1)!;
        after = { acceptedAt: last.acceptedAt, sender: last.sender, id: last.id };
      }
      throw new Error('INTENT_CALL_UNAVAILABLE');
    } finally {
      this.requestScope = null;
    }
  }
  async confirm(input: unknown) {
    const request = this.parse(input);
    if (!request.account || !request.peer || !request.callId || !request.content)
      throw new Error('INTENT_CONFIRM_REQUIRED');
    await this.resolve(request);
    return { ready: true };
  }
  private request: typeof fetch = async (input, init) => {
    this.alive();
    if (this.requestScope)
      await this.engine.deliveryAtomic((db) => this.recipient(db, this.requestScope!));
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init?.signal?.aborted) controller.abort();
    init?.signal?.addEventListener('abort', abort);
    this.requests.add(controller);
    try {
      return await this.host.request(input, { ...init, signal: controller.signal });
    } finally {
      init?.signal?.removeEventListener('abort', abort);
      this.requests.delete(controller);
    }
  };
  async send(input: unknown) {
    const request = this.parse(input);
    if (this.busy) throw new Error('INTENT_BUSY');
    if (!request.account || !request.peer || !request.callId || !request.content)
      throw new Error('INTENT_CONFIRM_REQUIRED');
    await this.initialize();
    if (this.busy) throw new Error('INTENT_BUSY');
    this.busy = true;
    this.requestScope = request;
    try {
      const committed = await this.engine.deliveryAtomic(async (db) => {
        const recipient = await this.binding(db, request);
        const id = messageId(recipient, request.content!, this.engine.currentIdentity()!.secret);
        if ((await db.all('SELECT id FROM forgotten_messages WHERE id=?', id)).length)
          throw new Error('INTENT_MESSAGE_REMOVED');
        const previous = (
          await db.all<{
            chat_id: string;
            sender: string;
            kind: string;
            body: string;
            sent_at: number;
          }>('SELECT chat_id,sender,kind,body,sent_at FROM messages WHERE id=?', id)
        )[0];
        if (
          previous &&
          (previous.chat_id !== recipient.conversation ||
            previous.sender !== recipient.account ||
            previous.kind !== 'text' ||
            previous.body !== request.content)
        )
          throw new Error('INTENT_MESSAGE_CONFLICT');
        const sentAt = previous?.sent_at ?? this.now();
        if (!previous) {
          await db.run(
            "INSERT INTO messages(id,chat_id,sender,kind,body,sent_at,received_at,reply_to,media_id,is_read) VALUES(?,?,?,'text',?,?,?,NULL,NULL,1)",
            id,
            recipient.conversation,
            recipient.account,
            request.content!,
            sentAt,
            this.now(),
          );
          await db.run('INSERT INTO deliveries(message_id,peer) VALUES(?,?)', id, recipient.peer);
        }
        return { ...recipient, id, sentAt };
      });
      const result = { messageId: committed.id, committed: true, uploaded: false };
      try {
        this.alive();
        const own = this.engine.currentIdentity()!;
        const client = scheduledPhoneClient(
          process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL!,
          own,
          this.request,
          2500,
        );
        const delivery = (this.delivery ??= new ApplicationDelivery(
          this.engine,
          client,
          this.host.signal,
          this.host.random,
          this.host.uuid,
          () => {},
          async () => null,
          this.now,
          true,
        ));
        const packet = {
          type: 'message' as const,
          id: committed.id,
          chat: committed.conversation,
          sentAt: committed.sentAt,
          kind: 'text' as const,
          body: request.content,
          media: null,
          replyTo: null,
        };
        await delivery.sendDurable(committed.peer, packet);
        const event = hash(['message', committed.id]);
        if (await delivery.journal.eventUploaded(committed.peer, event))
          return { ...result, uploaded: true };
        // Only an established call's session is eligible. The containing app
        // can retry a committed item if its cryptographic session needs repair.
        if (
          !(await delivery.journal.known(committed.peer)) ||
          (await delivery.journal.needsBundle(committed.peer))
        )
          return result;
        const token = hash([committed.peer, ['event', event]]);
        const row = (await delivery.journal.readyOutgoing([token]))[0];
        if (!row) return result;
        const envelope = await delivery.journal.seal(row.id);
        await this.resolve(request); // Revalidate account/phone/block/call after any asynchronous native work.
        this.alive();
        const response = await client.execute({ action: 'delivery-submit', envelope }, true);
        this.alive();
        if (!response.delivery?.accepted) return result;
        await this.engine.deliveryAtomic((db) => this.recipient(db, request));
        await delivery.journal.uploaded(row.id);
        return { ...result, uploaded: true };
      } catch {
        return result;
      } // Durable pending text remains for the ordinary app/retry.
    } finally {
      this.busy = false;
      this.requestScope = null;
    }
  }
  async close() {
    this.closed = true;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    this.delivery?.stop();
    await this.engine.close();
  }
}
