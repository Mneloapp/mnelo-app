import { wakeCapability } from './wake-protocol';
import { receiveMessageChange, applyMessageChange, type MessageChange } from './message-change';
import { isReactionEmoji, quickReactions } from './reaction-emoji';
import { readRichMedia, voteEmoji } from './rich-message';
import { z } from 'zod';
import {
  contactSchema,
  localSchema,
  packetSchema,
  peerKey,
  type Chat,
  type Contact,
  type LocalDatabase,
  type LocalIdentity,
  type LocalCall,
  type LocalMessage,
  type Media,
  type Packet,
  type PeerTransport,
} from './model';
import { createKeys, directChatId, verifyIdentity, bytesToHex, type RandomBytes } from './crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { internationalPhone } from './phone-protocol';
import { phoneEnrollment, type PhoneEnrollment } from './enrollment';
import {
  emptyProfile,
  localProfile,
  profileName,
  type LocalProfile,
  type ProfileInput,
} from './local-profile';
import { readCallRecord, type CallDirection, type CallOutcome } from './call-record';
import type { DeliveryAtomic } from './delivery/journal';
import { readPhotoPage, readSharedContent, type ContentTab } from './shared-content';

export type ChatFilter = 'all' | 'unread' | 'direct' | 'group';
export type ChatCursor = { activity: number; id: string };
export type IncomingMessage = { id: string; chat: string; type: 'message' | 'missed-call' };

type MessageRow = {
  edited_at?: number;
  id: string;
  chat_id: string;
  sender: string;
  kind: string;
  body: string;
  sent_at: number;
  received_at: number;
  reply_to: string | null;
  media_id: string | null;
  sequence: number;
  pending: number;
  unread_delivery: number;
};
const mapMessage = (row: MessageRow, own: string): LocalMessage => ({
  ...(row.edited_at ? { editedAt: row.edited_at } : {}),
  id: row.id,
  chatId: row.chat_id,
  sender: row.sender,
  kind: row.kind,
  body: row.body,
  sentAt: row.sent_at,
  receivedAt: row.received_at,
  replyTo: row.reply_to,
  attachment: row.media_id,
  sequence: row.sequence,
  status:
    row.sender !== own
      ? 'received'
      : row.pending
        ? 'pending'
        : row.unread_delivery
          ? 'delivered'
          : 'read',
});
const selectMessages = `SELECT m.*, (SELECT count(*) FROM deliveries d WHERE d.message_id=m.id AND d.acknowledged=0) AS pending, (SELECT count(*) FROM deliveries d WHERE d.message_id=m.id AND d.read_at IS NULL) AS unread_delivery FROM messages m`;

export type ConversationActivity =
  { type: 'message'; chat: string; outgoing: boolean } | { type: 'forget'; chat: string | null };

export class DeviceMessenger {
  private identity: LocalIdentity | null = null;
  private enrollment: PhoneEnrollment | null = null;
  private profile: LocalProfile = emptyProfile();
  private closing = false;
  private deliveryVersion = 1;
  private transport: PeerTransport | null = null;
  private listeners = new Set<() => void>();
  private conversationListeners = new Set<(event: ConversationActivity) => void>();
  private incomingListeners = new Set<(message: IncomingMessage) => void>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly db: LocalDatabase,
    private readonly random: RandomBytes,
    private readonly uuid: () => string,
    private readonly now = Date.now,
  ) {}
  private async transaction<T>(action: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      await this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await action();
        await this.db.exec('COMMIT');
        return result;
      } catch (error) {
        await this.db.exec('ROLLBACK');
        throw error;
      }
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  readonly deliveryAtomic: DeliveryAtomic = (work) =>
    this.transaction(async () => {
      if (this.closing || !this.identity) throw new Error('DEVICE_CLOSED');
      return work(this.db);
    });
  async hasReceivedMessage(peer: string, id: string) {
    await this.tail;
    return Boolean(
      (
        await this.db.all(
          "SELECT 1 FROM messages WHERE sender=? AND id=? UNION ALL SELECT 1 FROM forgotten_messages WHERE peer=? AND id=? UNION ALL SELECT 1 FROM message_changes WHERE peer=? AND message_id=? AND action='delete' LIMIT 1",
          peer,
          id,
          peer,
          id,
          peer,
          id,
        )
      ).length,
    );
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.listeners.forEach((listener) => listener());
  }
  subscribeConversationActivity(listener: (event: ConversationActivity) => void) {
    this.conversationListeners.add(listener);
    return () => {
      this.conversationListeners.delete(listener);
    };
  }
  private conversationActivity(event: ConversationActivity) {
    // Optional system integrations must never turn a committed send into a failed send.
    for (const listener of this.conversationListeners) {
      try {
        listener(event);
      } catch {
        /* No effect on message delivery. */
      }
    }
  }
  subscribeIncoming(listener: (message: IncomingMessage) => void) {
    this.incomingListeners.add(listener);
    return () => {
      this.incomingListeners.delete(listener);
    };
  }
  async initialize() {
    const version =
      (await this.db.all<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ?? 0;
    if (version > 6) throw new Error('DATABASE_VERSION_UNSUPPORTED');
    this.deliveryVersion = version >= 6 ? 2 : 1;
    await this.db.exec(localSchema);
    for (const [table, column, definition] of [
      ['messages', 'edited_at', 'INTEGER NOT NULL DEFAULT 0'],
      ['chats', 'left_group', 'INTEGER NOT NULL DEFAULT 0 CHECK(left_group IN (0,1))'],
      ['deliveries', 'read_at', 'INTEGER'],
      ['identity', 'username', "TEXT NOT NULL DEFAULT ''"],
      ['identity', 'first_name', "TEXT NOT NULL DEFAULT ''"],
      ['identity', 'last_name', "TEXT NOT NULL DEFAULT ''"],
      ['identity', 'headline', "TEXT NOT NULL DEFAULT ''"],
      ['identity', 'about', "TEXT NOT NULL DEFAULT ''"],
      ['identity', 'email', "TEXT NOT NULL DEFAULT ''"],
      ['identity', 'website', "TEXT NOT NULL DEFAULT ''"],
      ['identity', 'avatar', "TEXT NOT NULL DEFAULT ''"],
    ] as const) {
      const columns = await this.db.all<{ name: string }>(`PRAGMA table_info(${table})`);
      if (!columns.some((row) => row.name === column))
        await this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    if (version < 3) await this.db.run('UPDATE identity SET first_name=name');
    await this.db.exec(`PRAGMA user_version=${version >= 6 ? 6 : 5}`);
    const rows = await this.db.all<{ public_key: string; secret: string; name: string }>(
      'SELECT * FROM identity WHERE singleton=1',
    );
    const row = rows[0];
    if (row) {
      if (!verifyIdentity(row.secret, row.public_key)) throw new Error('IDENTITY_INVALID');
      this.identity = { key: row.public_key, secret: row.secret, name: row.name };
      this.profile = await this.readProfile();
      const receipt = (
        await this.db.all<{
          phone: string;
          service: string;
          test_only: number;
          verified_at: number;
        }>(
          'SELECT r.phone,e.service,e.test_only,e.verified_at FROM phone_enrollment e JOIN phone_registration r USING(singleton) WHERE e.singleton=1',
        )
      )[0];
      if (receipt)
        this.enrollment = phoneEnrollment.parse({
          phone: receipt.phone,
          service: receipt.service,
          testOnly: Boolean(receipt.test_only),
          verifiedAt: receipt.verified_at,
        });
    }
    return this.identity;
  }
  currentIdentity() {
    return this.identity;
  }
  currentDeliveryVersion() {
    return this.deliveryVersion;
  }
  async enableSignalDelivery() {
    await this.deliveryAtomic((db) => db.exec('PRAGMA user_version=6'));
    this.deliveryVersion = 2;
  }
  currentEnrollment() {
    return this.enrollment;
  }
  currentProfile() {
    return this.profile;
  }
  private async readProfile() {
    const row = (
      await this.db.all<ProfileRow>(
        'SELECT username,first_name,last_name,headline,about,email,website,avatar FROM identity WHERE singleton=1',
      )
    )[0];
    return profileFromRow(row);
  }
  async saveProfile(input: ProfileInput) {
    const profile = localProfile.parse(input);
    const identity = this.own();
    const name = profileName(profile);
    await this.transaction(() =>
      this.db.run(
        'UPDATE identity SET name=?,username=?,first_name=?,last_name=?,headline=?,about=?,email=?,website=?,avatar=? WHERE singleton=1',
        name,
        profile.username,
        profile.firstName,
        profile.lastName,
        profile.headline,
        profile.about,
        profile.email,
        profile.website,
        profile.avatar,
      ),
    );
    this.identity = { ...identity, name };
    this.profile = profile;
    this.changed();
  }
  async contactProfile(peer: string): Promise<LocalProfile | null> {
    peerKey.parse(peer);
    await this.tail;
    const row = (
      await this.db.all<ProfileRow>(
        'SELECT p.* FROM contact_profiles p JOIN contacts c USING(public_key) WHERE p.public_key=? AND c.blocked=0',
        peer,
      )
    )[0];
    return row ? profileFromRow(row) : null;
  }
  async profileShares() {
    return this.transaction(async () => {
      const profile = this.currentProfile();
      const hash = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(profile))));
      const old = (
        await this.db.all<{ revision: number; hash: string }>(
          'SELECT revision,hash FROM delivery_profile_clock WHERE singleton=1',
        )
      )[0];
      const revision = (old?.revision ?? 0) + (old?.hash === hash ? 0 : 1);
      if (!Number.isSafeInteger(revision)) throw new Error('PROFILE_REVISION_LIMIT');
      await this.db.run(
        'INSERT INTO delivery_profile_clock VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision,hash=excluded.hash',
        revision,
        hash,
      );
      const peers = await this.db.all<{ peer: string }>(
        'SELECT c.public_key AS peer FROM contacts c LEFT JOIN delivery_profile_sent s ON s.peer=c.public_key WHERE c.blocked=0 AND COALESCE(s.revision,0)<? ORDER BY c.public_key LIMIT 5',
        revision,
      );
      return { revision, profile, peers };
    });
  }
  async profileShared(peer: string, revision: number) {
    await this.transaction(async () => {
      if (
        !(
          await this.db.all(
            'SELECT public_key FROM contacts WHERE public_key=? AND blocked=0',
            peer,
          )
        ).length
      )
        return;
      await this.db.run(
        'INSERT INTO delivery_profile_sent VALUES(?,?) ON CONFLICT(peer) DO UPDATE SET revision=MAX(revision,excluded.revision)',
        peer,
        revision,
      );
    });
  }
  async receiveProfile(peer: string, input: unknown, revision?: number) {
    peerKey.parse(peer);
    const profile = localProfile.parse(input);
    let changed = false;
    await this.transaction(async () => {
      const contact = (
        await this.db.all<{ blocked: number }>(
          'SELECT blocked FROM contacts WHERE public_key=?',
          peer,
        )
      )[0];
      if (!contact || contact.blocked) return;
      if (revision !== undefined) {
        z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(revision);
        const old = (
          await this.db.all<{ revision: number }>(
            'SELECT revision FROM delivery_profile_received WHERE peer=?',
            peer,
          )
        )[0];
        if (old && old.revision >= revision) return;
        await this.db.run(
          'INSERT INTO delivery_profile_received VALUES(?,?) ON CONFLICT(peer) DO UPDATE SET revision=excluded.revision',
          peer,
          revision,
        );
      } else if (this.deliveryVersion === 2) throw new Error('PROFILE_REVISION_REQUIRED');
      const current = (
        await this.db.all<ProfileRow>('SELECT * FROM contact_profiles WHERE public_key=?', peer)
      )[0];
      if (current && JSON.stringify(profileFromRow(current)) === JSON.stringify(profile)) return;
      await this.db.run(
        'INSERT INTO contact_profiles VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(public_key) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,headline=excluded.headline,about=excluded.about,email=excluded.email,website=excluded.website,avatar=excluded.avatar',
        peer,
        profile.username,
        profile.firstName,
        profile.lastName,
        profile.headline,
        profile.about,
        profile.email,
        profile.website,
        profile.avatar,
      );
      const displayName = profileName(profile);
      if (displayName !== 'Mnelo') {
        const binding = (
          await this.db.all<{ phone: string }>(
            'SELECT phone FROM contact_numbers WHERE public_key=?',
            peer,
          )
        )[0];
        if (binding) {
          await this.db.run(
            'UPDATE contacts SET name=? WHERE public_key=? AND name=?',
            displayName,
            peer,
            binding.phone,
          );
          await this.db.run(
            'UPDATE chats SET title=? WHERE id=? AND title=?',
            displayName,
            directChatId(this.own().key, peer),
            binding.phone,
          );
        }
      }
      changed = true;
    });
    if (changed) this.changed();
    return changed;
  }
  // Only call after a successful verification response. Not exported in recovery archives.
  async completePhoneEnrollment(input: PhoneEnrollment, expectedKey: string) {
    const receipt = phoneEnrollment.parse(input);
    await this.transaction(async () => {
      if (this.own().key !== expectedKey) throw new Error('IDENTITY_CHANGED');
      await this.db.run(
        'INSERT INTO phone_registration VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET phone=excluded.phone',
        receipt.phone,
      );
      await this.db.run(
        'INSERT INTO phone_enrollment VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET service=excluded.service,test_only=excluded.test_only,verified_at=excluded.verified_at',
        receipt.service,
        Number(receipt.testOnly),
        receipt.verifiedAt,
      );
    });
    this.enrollment = receipt;
    this.changed();
  }
  async phoneNumber(): Promise<string | null> {
    return (
      (
        await this.db.all<{ phone: string }>(
          'SELECT phone FROM phone_registration WHERE singleton=1',
        )
      )[0]?.phone ?? null
    );
  }
  async rememberPhone(phone: string | null) {
    this.own();
    await this.transaction(async () => {
      await this.db.run('DELETE FROM phone_enrollment');
      if (phone === null) await this.db.run('DELETE FROM phone_registration');
      else
        await this.db.run(
          'INSERT INTO phone_registration VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET phone=excluded.phone',
          internationalPhone.parse(phone),
        );
    });
    this.enrollment = null;
    this.changed();
  }
  private own() {
    if (!this.identity) throw new Error('IDENTITY_REQUIRED');
    return this.identity;
  }
  async createIdentity(name?: string) {
    const parsed = z
      .string()
      .trim()
      .min(1)
      .max(60)
      .parse(name ?? 'Mnelo');
    const created = { ...createKeys(this.random), name: parsed };
    await this.transaction(async () => {
      if ((await this.db.all('SELECT singleton FROM identity')).length)
        throw new Error('IDENTITY_EXISTS');
      await this.db.run(
        'INSERT INTO identity(singleton,public_key,secret,name,first_name) VALUES(1,?,?,?,?)',
        created.key,
        created.secret,
        created.name,
        name ? parsed : '',
      );
    });
    this.identity = created;
    this.profile = { ...emptyProfile(), firstName: name ? parsed : '' };
    this.changed();
    return created;
  }
  async rename(name: string) {
    const parsed = z.string().trim().min(1).max(60).parse(name);
    await this.saveProfile({ ...this.profile, firstName: parsed, lastName: '' });
  }
  attachTransport(transport: PeerTransport) {
    this.transport?.stop();
    this.transport = transport;
  }
  private async transmit(peer: string, packet: Packet, event?: { id: string; createdAt: number }) {
    if (!this.transport) return false;
    if (this.transport.sendDurable) return this.transport.sendDurable(peer, packet, event);
    return this.transport.send(peer, packet);
  }
  async contacts(): Promise<Contact[]> {
    await this.tail;
    const rows = await this.db.all<{
      public_key: string;
      name: string;
      blocked: number;
      phone: string | null;
    }>(
      'SELECT c.*,n.phone FROM contacts c LEFT JOIN contact_numbers n USING(public_key) ORDER BY c.name,c.public_key LIMIT 1000',
    );
    return rows.map((row) => ({
      key: row.public_key,
      name: row.name,
      blocked: Boolean(row.blocked),
      ...(row.phone ? { phone: row.phone } : {}),
    }));
  }
  async contactDisplayNames(): Promise<Map<string, string>> {
    await this.tail;
    const rows = await this.db.all<{ public_key: string; display_name: string }>(
      `SELECT c.public_key, COALESCE(
        NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')),''),
        CASE WHEN p.username!='' THEN '@' || p.username END,
        n.phone, c.name) AS display_name
      FROM contacts c LEFT JOIN contact_profiles p USING(public_key)
      LEFT JOIN contact_numbers n USING(public_key) WHERE c.blocked=0`,
    );
    return new Map(rows.map((row) => [row.public_key, row.display_name]));
  }
  // First-use number lookup pins the returned key locally; it is not a claim of
  // out-of-band verification. A later directory response may never replace it.
  async trustPhoneContact(input: { key: string; phone: string; name?: string }) {
    const phone = internationalPhone.parse(input.phone);
    const contact = contactSchema.parse({ key: input.key, name: input.name?.trim() || phone });
    const own = this.own().key;
    if (contact.key === own) throw new Error('CONTACT_INVALID');
    await this.transaction(() => this.pinPhoneContact(contact, phone));
    this.changed();
    return directChatId(own, contact.key);
  }
  private async pinPhoneContact(contact: { key: string; name: string }, phone: string) {
    const binding = (
      await this.db.all<{ public_key: string }>(
        'SELECT public_key FROM contact_numbers WHERE phone=?',
        phone,
      )
    )[0];
    if (binding && binding.public_key !== contact.key) throw new Error('PHONE_IDENTITY_CHANGED');
    const existing = (
      await this.db.all<{ name: string; blocked: number }>(
        'SELECT name,blocked FROM contacts WHERE public_key=?',
        contact.key,
      )
    )[0];
    if (existing?.blocked) throw new Error('CONTACT_BLOCKED');
    const previous = (
      await this.db.all<{ phone: string }>(
        'SELECT phone FROM contact_numbers WHERE public_key=?',
        contact.key,
      )
    )[0];
    if (previous && previous.phone !== phone) throw new Error('PHONE_IDENTITY_CHANGED');
    const name = existing?.name ?? contact.name;
    await this.db.run(
      'INSERT OR IGNORE INTO contacts(public_key,name) VALUES(?,?)',
      contact.key,
      name,
    );
    await this.db.run(
      'INSERT OR IGNORE INTO contact_numbers(phone,public_key) VALUES(?,?)',
      phone,
      contact.key,
    );
    await this.ensureDirect(contact.key, name);
  }
  async contactRequests() {
    await this.tail;
    return this.db.all<{ public_key: string; phone: string; received_at: number }>(
      'SELECT * FROM contact_requests ORDER BY received_at DESC LIMIT 24',
    );
  }
  async receiveContactRequest(peer: string, phone: string) {
    peerKey.parse(peer);
    internationalPhone.parse(phone);
    if (peer === this.own().key) return false;
    const added = await this.transaction(async () => {
      if ((await this.db.all('SELECT 1 FROM contacts WHERE public_key=?', peer)).length)
        return false;
      if (
        (
          await this.db.all(
            'SELECT 1 FROM contact_requests WHERE public_key=? OR phone=?',
            peer,
            phone,
          )
        ).length
      )
        return false;
      if ((await this.db.all('SELECT 1 FROM contact_numbers WHERE phone=?', phone)).length)
        return false;
      if (
        (await this.db.all<{ count: number }>('SELECT count(*) AS count FROM contact_requests'))[0]!
          .count >= 24
      )
        return false;
      await this.db.run('INSERT INTO contact_requests VALUES(?,?,?)', peer, phone, this.now());
      return true;
    });
    if (added) this.changed();
    return added;
  }
  async acceptContactRequest(peer: string) {
    peerKey.parse(peer);
    await this.transaction(async () => {
      const request = (
        await this.db.all<{ phone: string }>(
          'SELECT phone FROM contact_requests WHERE public_key=?',
          peer,
        )
      )[0];
      if (!request) throw new Error('CONTACT_UNAVAILABLE');
      await this.pinPhoneContact({ key: peer, name: request.phone }, request.phone);
      await this.db.run('DELETE FROM contact_requests WHERE public_key=?', peer);
    });
    this.changed();
    return directChatId(this.own().key, peer);
  }
  async rejectContactRequest(peer: string) {
    peerKey.parse(peer);
    await this.transaction(async () => {
      const request = (
        await this.db.all<{ phone: string }>(
          'SELECT phone FROM contact_requests WHERE public_key=?',
          peer,
        )
      )[0];
      if (!request) return;
      await this.db.run(
        'INSERT INTO contacts(public_key,name,blocked) VALUES(?,?,1) ON CONFLICT(public_key) DO UPDATE SET blocked=1',
        peer,
        request.phone,
      );
      await this.db.run('DELETE FROM contact_requests WHERE public_key=?', peer);
    });
    this.changed();
  }
  async trustContact(input: { key: string; name: string }) {
    const contact = contactSchema.parse(input);
    const own = this.own().key;
    if (contact.key === own) throw new Error('CONTACT_INVALID');
    await this.transaction(async () => {
      await this.db.run(
        'INSERT INTO contacts(public_key,name) VALUES(?,?) ON CONFLICT(public_key) DO UPDATE SET name=excluded.name',
        contact.key,
        contact.name,
      );
      await this.ensureDirect(contact.key, contact.name);
    });
    this.changed();
    return directChatId(own, contact.key);
  }
  private async ensureDirect(peer: string, name: string) {
    const own = this.own().key;
    const id = directChatId(own, peer);
    await this.db.run(
      "INSERT OR IGNORE INTO chats(id,kind,title,owner) VALUES(?,'direct',?,?)",
      id,
      name,
      own,
    );
    for (const key of [own, peer])
      await this.db.run('INSERT OR IGNORE INTO members VALUES(?,?)', id, key);
    return id;
  }
  async acceptsPeer(peer: string) {
    if (this.closing) return false;
    if (!peerKey.safeParse(peer).success) return false;
    await this.tail;
    const rows = await this.db.all<{ blocked: number }>(
      'SELECT blocked FROM contacts WHERE public_key=?',
      peer,
    );
    return rows[0]?.blocked === 0;
  }
  async ownWakeCapability(peer: string) {
    if (!(await this.acceptsPeer(peer))) throw new Error('CONTACT_BLOCKED');
    return this.transaction(async () => {
      if (
        (
          await this.db.all<{ blocked: number }>(
            'SELECT blocked FROM contacts WHERE public_key=?',
            peer,
          )
        )[0]?.blocked !== 0
      )
        throw new Error('CONTACT_BLOCKED');
      const existing = (
        await this.db.all<{ own: string }>('SELECT own FROM wake_capabilities WHERE peer=?', peer)
      )[0];
      if (existing) return existing.own;
      const capability = Array.from(this.random(32), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      await this.db.run('INSERT INTO wake_capabilities(peer,own) VALUES(?,?)', peer, capability);
      return capability;
    });
  }
  async savePeerWakeCapability(peer: string, capability: string) {
    wakeCapability.parse(capability);
    if (!(await this.acceptsPeer(peer))) return;
    await this.ownWakeCapability(peer);
    await this.transaction(async () => {
      const blocked = (
        await this.db.all<{ blocked: number }>(
          'SELECT blocked FROM contacts WHERE public_key=?',
          peer,
        )
      )[0]?.blocked;
      if (blocked === 0)
        await this.db.run('UPDATE wake_capabilities SET remote=? WHERE peer=?', capability, peer);
    });
  }
  async peerWakeCapability(peer: string) {
    await this.tail;
    return (
      (
        await this.db.all<{ remote: string | null }>(
          'SELECT w.remote FROM wake_capabilities w JOIN contacts c ON c.public_key=w.peer WHERE w.peer=? AND c.blocked=0',
          peer,
        )
      )[0]?.remote ?? null
    );
  }
  async wakeRevocations() {
    await this.tail;
    return this.db.all<{ capability: string }>(
      'SELECT capability FROM wake_revocations LIMIT 1000',
    );
  }
  async acknowledgeWakeRevocation(capability: string) {
    await this.transaction(() =>
      this.db.run('DELETE FROM wake_revocations WHERE capability=?', capability),
    );
  }
  async block(peer: string, blocked = true) {
    peerKey.parse(peer);
    await this.transaction(async () => {
      await this.db.run('UPDATE contacts SET blocked=? WHERE public_key=?', Number(blocked), peer);
      await this.db.run(
        'INSERT INTO delivery_block_changes VALUES(?,?,?) ON CONFLICT(peer) DO UPDATE SET blocked=excluded.blocked,revision=excluded.revision',
        peer,
        Number(blocked),
        this.uuid(),
      );
      if (blocked) {
        await this.db.run('DELETE FROM control_outbox WHERE peer=?', peer);
        for (const [table, column] of [
          ['signal_outbox', 'peer'],
          ['signal_inbox', 'sender'],
          ['delivery_media_outbox', 'peer'],
          ['delivery_media_inbox', 'owner'],
        ] as const) {
          if (await this.hasTable(table))
            await this.db.run(`DELETE FROM ${table} WHERE ${column}=?`, peer);
        }
        await this.db.run(
          'INSERT OR IGNORE INTO wake_revocations SELECT own FROM wake_capabilities WHERE peer=?',
          peer,
        );
        await this.db.run('DELETE FROM wake_capabilities WHERE peer=?', peer);
      }
    });
    if (blocked) this.conversationActivity({ type: 'forget', chat: null });
    this.changed();
  }
  async deliveryBlocks() {
    await this.tail;
    return this.db.all<{ peer: string; blocked: number; revision: string }>(
      'SELECT * FROM delivery_block_changes LIMIT 20',
    );
  }
  async deliveryBlockApplied(peer: string, revision: string) {
    return this.transaction(() =>
      this.db.run('DELETE FROM delivery_block_changes WHERE peer=? AND revision=?', peer, revision),
    );
  }
  private async hasTable(table: string) {
    return Boolean(
      (await this.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table))
        .length,
    );
  }
  private async purgeDeliveryMessage(id: string) {
    if (await this.hasTable('delivery_media_outbox'))
      await this.db.run('DELETE FROM delivery_media_outbox WHERE message_id=?', id);
    if (await this.hasTable('signal_outbox'))
      await this.db.run(
        "DELETE FROM signal_outbox WHERE uploaded=0 AND (CASE WHEN json_valid(body) AND json_extract(body,'$.packet.type')='message' THEN json_extract(body,'$.packet.id') ELSE NULL END)=?",
        id,
      );
  }
  async chats(): Promise<Chat[]> {
    return (await this.chatPage()).rows;
  }
  async chatPage(
    filter: ChatFilter = 'all',
    search = '',
    before?: ChatCursor,
    displayTitle?: (chat: Chat) => string,
  ): Promise<{ rows: Chat[]; next: ChatCursor | undefined }> {
    await this.tail;
    const own = this.own().key;
    const needle = search.trim().normalize('NFC').toLocaleLowerCase();
    const rows: Chat[] = [];
    let cursor = before;
    // Scan bounded metadata pages for Unicode-aware search; never load message histories.
    // SQL applies kind/unread filters before pagination, including conversations beyond page one.
    for (;;) {
      const batch = await this.db.all<Chat>(
        `WITH summaries AS (SELECT c.*,
          (SELECT public_key FROM members WHERE chat_id=c.id AND public_key!=? LIMIT 1) AS peer,
          (SELECT count(*) FROM messages m WHERE m.chat_id=c.id AND m.sender!=? AND m.kind!='call' AND m.is_read=0) AS unread,
          COALESCE((SELECT body FROM messages m WHERE m.chat_id=c.id ORDER BY sequence DESC LIMIT 1),'') AS preview,
          COALESCE((SELECT kind FROM messages m WHERE m.chat_id=c.id ORDER BY sequence DESC LIMIT 1),'') AS previewKind,
          COALESCE((SELECT received_at FROM messages m WHERE m.chat_id=c.id ORDER BY sequence DESC LIMIT 1),0) AS updated,
          COALESCE((SELECT MAX(sequence) FROM messages m WHERE m.chat_id=c.id),0) AS activity
          FROM chats c)
        SELECT * FROM summaries WHERE (?='all' OR (?='unread' AND unread>0) OR kind=?)
        AND (activity<? OR (activity=? AND id>?)) ORDER BY activity DESC,id LIMIT 100`,
        own,
        own,
        filter,
        filter,
        filter,
        cursor?.activity ?? Number.MAX_SAFE_INTEGER,
        cursor?.activity ?? Number.MAX_SAFE_INTEGER,
        cursor?.id ?? '',
      );
      for (const row of batch) {
        cursor = { activity: row.activity, id: row.id };
        const title = displayTitle?.(row) ?? row.title;
        if (title.normalize('NFC').toLocaleLowerCase().includes(needle))
          rows.push({ ...row, title });
        if (rows.length === 40) return { rows, next: cursor };
      }
      if (batch.length < 100) return { rows, next: undefined };
    }
  }
  async attentionCounts(): Promise<{ messages: number; calls: number }> {
    await this.tail;
    const own = this.own().key;
    const row = (
      await this.db.all<{ messages: number; calls: number }>(
        `SELECT COUNT(CASE WHEN kind!='call' AND sender!=? THEN 1 END) AS messages,
        COUNT(CASE WHEN kind='call' AND body LIKE '%:incoming:missed' THEN 1 END) AS calls
        FROM messages WHERE is_read=0`,
        own,
      )
    )[0];
    return { messages: row?.messages ?? 0, calls: row?.calls ?? 0 };
  }
  async attentionPending(id: string) {
    await this.tail;
    return Boolean(
      (await this.db.all('SELECT id FROM messages WHERE id=? AND is_read=0', id)).length,
    );
  }
  async markCallsSeen(through: number) {
    await this.transaction(() =>
      this.db.run(
        "UPDATE messages SET is_read=1 WHERE kind='call' AND is_read=0 AND sequence<=?",
        through,
      ),
    );
    this.changed();
  }
  async chat(id: string) {
    await this.tail;
    return (
      (
        await this.db.all<Chat>(
          'SELECT c.*, (SELECT public_key FROM members WHERE chat_id=c.id AND public_key!=? LIMIT 1) AS peer FROM chats c WHERE id=?',
          this.own().key,
          id,
        )
      )[0] ?? null
    );
  }
  async members(id: string) {
    await this.tail;
    return this.db.all<{ key: string; name: string }>(
      'SELECT m.public_key AS key,COALESCE(c.name, m.public_key) AS name FROM members m LEFT JOIN contacts c ON c.public_key=m.public_key WHERE m.chat_id=?',
      id,
    );
  }
  async messages(chat: string, before = Number.MAX_SAFE_INTEGER): Promise<LocalMessage[]> {
    await this.tail;
    return (
      await this.db.all<MessageRow>(
        selectMessages + ' WHERE m.chat_id=? AND m.sequence<? ORDER BY m.sequence DESC LIMIT 40',
        chat,
        before,
      )
    ).map((row) => mapMessage(row, this.own().key));
  }
  async media(id: string) {
    await this.tail;
    return (
      (await this.db.all<Media>('SELECT name,mime,bytes,duration FROM media WHERE id=?', id))[0] ??
      null
    );
  }
  async sharedContent(chat: string, tab: ContentTab, before = Number.MAX_SAFE_INTEGER) {
    await this.tail;
    return readSharedContent(this.db, chat, tab, before);
  }
  async photoPage(chat: string, cursor: number, direction: 'before' | 'after') {
    await this.tail;
    return readPhotoPage(this.db, chat, cursor, direction);
  }
  async reactions(id: string) {
    await this.tail;
    return this.db.all<{ peer: string; emoji: string }>(
      'SELECT peer,emoji FROM reactions WHERE message_id=?',
      id,
    );
  }
  async replyPreview(chat: string, id: string) {
    await this.tail;
    // A peer-controlled reply ID cannot expose a message from another conversation.
    return (
      (
        await this.db.all<{ sender: string; body: string; kind: string; name: string | null }>(
          'SELECT m.sender,substr(m.body,1,160) AS body,m.kind,c.name FROM messages m LEFT JOIN contacts c ON c.public_key=m.sender WHERE m.chat_id=? AND m.id=?',
          chat,
          id,
        )
      )[0] ?? null
    );
  }
  async send(
    chat: string,
    body: string,
    options: {
      kind?: 'text' | 'image' | 'file' | 'voice' | 'location' | 'contact';
      media?: Media;
      replyTo?: string;
    } = {},
  ) {
    const own = this.own().key;
    const packet = packetSchema.parse({
      type: 'message',
      id: this.uuid(),
      chat,
      sentAt: this.now(),
      kind: options.kind ?? 'text',
      body,
      media: options.media ?? null,
      replyTo: options.replyTo ?? null,
    });
    if (packet.type !== 'message' || (!body.trim() && !packet.media))
      throw new Error('MESSAGE_INVALID');
    await this.transaction(async () => {
      const keys = await this.db.all<{ public_key: string }>(
        'SELECT public_key FROM members WHERE chat_id=?',
        chat,
      );
      if (
        (
          await this.db.all<{ left_group: number }>('SELECT left_group FROM chats WHERE id=?', chat)
        )[0]?.left_group ||
        !keys.some((row) => row.public_key === own) ||
        keys.length < 2
      )
        throw new Error('CHAT_FORBIDDEN');
      const peers = keys.filter((row) => row.public_key !== own);
      const blocked = await this.db.all(
        'SELECT m.public_key FROM members m JOIN contacts c ON c.public_key=m.public_key WHERE m.chat_id=? AND c.blocked=1',
        chat,
      );
      if (blocked.length) throw new Error('CONTACT_BLOCKED');
      await this.insertMessage(own, packet, true);
      for (const peer of peers)
        await this.db.run(
          'INSERT INTO deliveries(message_id,peer) VALUES(?,?)',
          packet.id,
          peer.public_key,
        );
    });
    this.conversationActivity({ type: 'message', chat, outgoing: true });
    this.changed();
    await this.flush().catch(() => undefined);
    return packet.id;
  }
  private async insertMessage(
    peer: string,
    packet: Extract<Packet, { type: 'message' }>,
    own = false,
  ) {
    const file = packet.media;
    if (file) {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.bytes) || file.bytes.length % 4 !== 0)
        throw new Error('MEDIA_INVALID');
      await this.db.run(
        'INSERT INTO media VALUES(?,?,?,?,?)',
        packet.id,
        file.name,
        file.mime,
        file.bytes,
        file.duration,
      );
    }
    await this.db.run(
      'INSERT INTO messages(id,chat_id,sender,kind,body,sent_at,received_at,reply_to,media_id,is_read) VALUES(?,?,?,?,?,?,?,?,?,?)',
      packet.id,
      packet.chat,
      peer,
      packet.kind,
      packet.body,
      packet.sentAt,
      this.now(),
      packet.replyTo,
      file ? packet.id : null,
      Number(own),
    );
    await applyMessageChange(this.db, peer, packet.id, packet.chat);
  }
  async flush(peer?: string) {
    await this.tail;
    if (!this.transport || !this.identity) return;
    const controls = await this.db.all<{
      id: string;
      peer: string;
      packet: string;
      created_at: number;
    }>(
      `SELECT o.* FROM control_outbox o JOIN contacts c ON c.public_key=o.peer WHERE c.blocked=0 ${peer ? 'AND o.peer=?' : ''} ORDER BY o.rowid LIMIT 50`,
      ...(peer ? [peer] : []),
    );
    for (const row of controls) {
      if (
        await this.transmit(row.peer, packetSchema.parse(JSON.parse(row.packet)), {
          id: row.id,
          createdAt: row.created_at,
        })
      )
        await this.transaction(() => this.db.run('DELETE FROM control_outbox WHERE id=?', row.id));
    }
    const states = await this.db.all<{ chat_id: string; peer: string }>(
      `SELECT g.chat_id,g.peer FROM group_deliveries g JOIN chats c ON c.id=g.chat_id WHERE c.owner=? AND g.revision<c.revision ${peer ? 'AND g.peer=?' : ''} LIMIT 50`,
      this.own().key,
      ...(peer ? [peer] : []),
    );
    for (const state of states)
      if (await this.acceptsPeer(state.peer)) await this.sendGroupState(state.chat_id, state.peer);
    const leaving = await this.db.all<{ id: string; owner: string }>(
      "SELECT id,owner FROM chats WHERE kind='group' AND left_group=1 AND owner!=?",
      this.own().key,
    );
    for (const group of leaving)
      if ((!peer || peer === group.owner) && (await this.acceptsPeer(group.owner)))
        await this.transmit(group.owner, { type: 'group_leave', id: group.id });
    const pending = await this.db.all<{ peer: string; message_id: string }>(
      `SELECT d.peer,d.message_id FROM deliveries d JOIN contacts c ON c.public_key=d.peer WHERE d.acknowledged=0 AND d.held=0 AND c.blocked=0 ${peer ? 'AND d.peer=?' : ''} LIMIT 50`,
      ...(peer ? [peer] : []),
    );
    for (const item of pending) {
      const row = (
        await this.db.all<MessageRow>(selectMessages + ' WHERE m.id=?', item.message_id)
      )[0];
      if (!row) continue;
      if (!(await this.members(row.chat_id)).some((member) => member.key === item.peer)) continue;
      if (!(await this.sendGroupState(row.chat_id, item.peer))) continue;
      const media = row.media_id ? await this.media(row.media_id) : null;
      await this.transmit(
        item.peer,
        packetSchema.parse({
          type: 'message',
          id: row.id,
          chat: row.chat_id,
          sentAt: row.sent_at,
          kind: row.kind,
          body: row.body,
          replyTo: row.reply_to,
          media,
        }),
      );
    }
  }
  private async sendGroupState(id: string, peer: string) {
    const chat = await this.chat(id);
    if (!chat || chat.kind === 'direct') return true;
    // Only the owner can originate membership; never forge an admin snapshot.
    if (chat.owner !== this.own().key) return true;
    const members = (await this.members(id)).map((member) => ({
      key: member.key,
      name: member.key === this.own().key ? this.own().name : member.name,
    }));
    return (
      this.transmit(peer, {
        type: 'group',
        id,
        title: chat.title,
        revision: chat.revision,
        members,
      }) ?? false
    );
  }
  async createGroup(title: string, peers: string[]) {
    const name = z.string().trim().min(1).max(80).parse(title);
    const own = this.own().key;
    const unique = [...new Set(peers)];
    if (unique.length < 1 || unique.length > 15 || unique.includes(own))
      throw new Error('GROUP_INVALID');
    for (const key of unique)
      if (!(await this.acceptsPeer(key))) throw new Error('CONTACT_UNTRUSTED');
    const id = this.uuid();
    await this.transaction(async () => {
      await this.db.run(
        "INSERT INTO chats(id,kind,title,owner) VALUES(?,'group',?,?)",
        id,
        name,
        own,
      );
      for (const key of [own, ...unique])
        await this.db.run('INSERT INTO members VALUES(?,?)', id, key);
      for (const key of unique)
        await this.db.run(
          'INSERT INTO group_deliveries(chat_id,peer,revision) VALUES(?,?,0)',
          id,
          key,
        );
    });
    this.changed();
    for (const key of unique) await this.sendGroupState(id, key);
    return id;
  }
  async updateGroup(id: string, title: string, peers: string[]) {
    const own = this.own().key;
    const unique = [...new Set(peers)];
    const name = z.string().trim().min(1).max(80).parse(title);
    if (unique.length > 15 || unique.includes(own)) throw new Error('GROUP_INVALID');
    for (const key of unique)
      if (!(await this.acceptsPeer(key))) throw new Error('CONTACT_UNTRUSTED');
    await this.transaction(async () => {
      const chat = (await this.db.all<Chat>('SELECT * FROM chats WHERE id=?', id))[0];
      if (chat?.kind !== 'group' || chat.owner !== own) throw new Error('GROUP_FORBIDDEN');
      await this.replaceMembers(id, name, [own, ...unique]);
    });
    this.changed();
    await this.flush().catch(() => undefined);
  }
  private async replaceMembers(id: string, title: string, keys: string[]) {
    for (const row of await this.db.all<{ public_key: string }>(
      'SELECT public_key FROM members WHERE chat_id=?',
      id,
    ))
      if (row.public_key !== this.own().key)
        await this.db.run(
          'INSERT OR IGNORE INTO group_deliveries(chat_id,peer,revision) VALUES(?,?,0)',
          id,
          row.public_key,
        );
    await this.db.run('UPDATE chats SET title=?,revision=revision+1 WHERE id=?', title, id);
    await this.db.run('DELETE FROM members WHERE chat_id=?', id);
    for (const key of keys) {
      await this.db.run('INSERT INTO members VALUES(?,?)', id, key);
      if (key !== this.own().key)
        await this.db.run(
          'INSERT OR IGNORE INTO group_deliveries(chat_id,peer,revision) VALUES(?,?,0)',
          id,
          key,
        );
    }
    await this.db.run(
      'DELETE FROM deliveries WHERE message_id IN (SELECT id FROM messages WHERE chat_id=?) AND peer NOT IN (SELECT public_key FROM members WHERE chat_id=?)',
      id,
      id,
    );
  }
  async leaveGroup(id: string) {
    await this.transaction(async () => {
      const chat = (await this.db.all<Chat>('SELECT * FROM chats WHERE id=?', id))[0];
      if (chat?.kind !== 'group' || chat.owner === this.own().key)
        throw new Error('GROUP_OWNER_REQUIRED');
      await this.db.run('UPDATE chats SET left_group=1 WHERE id=?', id);
      await this.db.run(
        'DELETE FROM deliveries WHERE message_id IN (SELECT id FROM messages WHERE chat_id=?)',
        id,
      );
    });
    this.conversationActivity({ type: 'forget', chat: id });
    this.changed();
    await this.flush().catch(() => undefined);
  }
  async receive(
    peer: string,
    input: unknown,
    options: { sendReceipts?: boolean } = {},
  ): Promise<boolean> {
    if (!(await this.acceptsPeer(peer))) return false;
    const parsed = packetSchema.safeParse(input);
    if (!parsed.success) return false;
    const packet = parsed.data;
    const own = this.own().key;
    let acknowledge: string | null = null;
    let incoming: IncomingMessage | null = null;
    let groupAck: { id: string; revision: number } | null = null;
    try {
      await this.transaction(async () => {
        // Recheck the block after acquiring the mutation lock.
        if (
          (
            await this.db.all<{ blocked: number }>(
              'SELECT blocked FROM contacts WHERE public_key=?',
              peer,
            )
          )[0]?.blocked !== 0
        )
          throw new Error('CONTACT_BLOCKED');
        if (packet.type === 'message_change') {
          await receiveMessageChange(this.db, own, peer, packet);
          return;
        }
        if (packet.type === 'group_ack') {
          await this.db.run(
            'UPDATE group_deliveries SET revision=MAX(revision,?) WHERE chat_id=? AND peer=? AND ?<=(SELECT revision FROM chats WHERE id=?)',
            packet.revision,
            packet.id,
            peer,
            packet.revision,
            packet.id,
          );
          return;
        }
        if (packet.type === 'group_leave') {
          const chat = (await this.db.all<Chat>('SELECT * FROM chats WHERE id=?', packet.id))[0];
          if (chat?.owner !== own || chat.kind !== 'group') throw new Error('GROUP_FORBIDDEN');
          const rows = await this.db.all<{ public_key: string }>(
            'SELECT public_key FROM members WHERE chat_id=?',
            packet.id,
          );
          if (rows.some((row) => row.public_key === peer))
            await this.replaceMembers(
              packet.id,
              chat.title,
              rows.map((row) => row.public_key).filter((key) => key !== peer),
            );
          return;
        }
        if (packet.type === 'read_ids') {
          // Attachment uploads can let a later text arrive first. A read of that
          // text must never mark the missing earlier attachment as received/read.
          for (const id of packet.ids) {
            if (
              !(
                await this.db.all(
                  'SELECT m.id FROM messages m JOIN deliveries d ON d.message_id=m.id WHERE m.id=? AND m.chat_id=? AND m.sender=? AND d.peer=?',
                  id,
                  packet.chat,
                  own,
                  peer,
                )
              ).length
            )
              throw new Error('READ_FORBIDDEN');
          }
          for (const id of packet.ids)
            await this.db.run(
              'UPDATE deliveries SET acknowledged=1,read_at=COALESCE(read_at,?) WHERE message_id=? AND peer=?',
              this.now(),
              id,
              peer,
            );
          return;
        }
        if (packet.type === 'read') {
          const row = (
            await this.db.all<{ sequence: number }>(
              'SELECT sequence FROM messages WHERE id=? AND chat_id=? AND sender=?',
              packet.through,
              packet.chat,
              own,
            )
          )[0];
          if (!row) throw new Error('READ_FORBIDDEN');
          await this.db.run(
            `UPDATE deliveries SET acknowledged=1,read_at=COALESCE(read_at,?) WHERE peer=? AND message_id IN (SELECT id FROM messages WHERE chat_id=? AND sequence${this.deliveryVersion === 2 ? '=' : '<='}?)`,
            this.now(),
            peer,
            packet.chat,
            row.sequence,
          );
          return;
        }
        if (packet.type === 'ack') {
          await this.db.run(
            'UPDATE deliveries SET acknowledged=1 WHERE message_id=? AND peer=?',
            packet.id,
            peer,
          );
          if (await this.hasTable('delivery_media_outbox'))
            await this.db.run(
              'DELETE FROM delivery_media_outbox WHERE message_id=? AND peer=?',
              packet.id,
              peer,
            );
          return;
        }
        if (packet.type === 'group') {
          const existing = (
            await this.db.all<Chat>('SELECT * FROM chats WHERE id=?', packet.id)
          )[0];
          const keys = packet.members.map((member) => member.key);
          if (
            new Set(keys).size !== keys.length ||
            (!existing && !keys.includes(own)) ||
            !keys.includes(peer)
          )
            throw new Error('GROUP_INVALID');
          if (existing && (existing.owner !== peer || existing.kind !== 'group'))
            throw new Error('GROUP_FORBIDDEN');
          groupAck = { id: packet.id, revision: packet.revision };
          if (existing && packet.revision <= existing.revision) return;
          // Full snapshots from the pinned owner may skip offline revisions; never roll back.
          await this.db.run(
            "INSERT INTO chats(id,kind,title,owner,revision) VALUES(?,'group',?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,revision=excluded.revision",
            packet.id,
            packet.title,
            peer,
            packet.revision,
          );
          await this.db.run('DELETE FROM members WHERE chat_id=?', packet.id);
          for (const member of packet.members) {
            await this.db.run('INSERT INTO members VALUES(?,?)', packet.id, member.key);
            if (member.key !== own)
              await this.db.run(
                'INSERT OR IGNORE INTO contacts(public_key,name) VALUES(?,?)',
                member.key,
                member.name,
              );
          }
          return;
        }
        if (packet.type === 'message') {
          const duplicate = (
            await this.db.all<{ sender: string }>(
              'SELECT sender FROM messages WHERE id=?',
              packet.id,
            )
          )[0];
          const forgotten = (
            await this.db.all<{ peer: string }>(
              'SELECT peer FROM forgotten_messages WHERE id=?',
              packet.id,
            )
          )[0];
          if (duplicate || forgotten) {
            if ((duplicate?.sender ?? forgotten?.peer) !== peer)
              throw new Error('MESSAGE_FORBIDDEN');
            acknowledge = packet.id;
            return;
          }
          if (packet.chat === directChatId(own, peer)) {
            const contact = (
              await this.db.all<{ name: string }>(
                'SELECT name FROM contacts WHERE public_key=?',
                peer,
              )
            )[0];
            await this.ensureDirect(peer, contact?.name ?? peer);
          }
          const keys = await this.db.all<{ public_key: string }>(
            'SELECT public_key FROM members WHERE chat_id=?',
            packet.chat,
          );
          if (
            !keys.some((row) => row.public_key === own) ||
            !keys.some((row) => row.public_key === peer)
          )
            throw new Error('CHAT_FORBIDDEN');
          if (
            (
              await this.db.all<{ left_group: number }>(
                'SELECT left_group FROM chats WHERE id=?',
                packet.chat,
              )
            )[0]?.left_group
          )
            throw new Error('GROUP_LEFT');
          await this.insertMessage(peer, packet);
          if (
            !(await this.db.all("SELECT id FROM messages WHERE id=? AND kind='deleted'", packet.id))
              .length
          )
            incoming = { id: packet.id, chat: packet.chat, type: 'message' };
          acknowledge = packet.id;
          return;
        }
        if (packet.type === 'reaction') {
          const member = await this.db.all(
            'SELECT m.id FROM messages m JOIN members p ON p.chat_id=m.chat_id WHERE m.id=? AND p.public_key=?',
            packet.id,
            peer,
          );
          if (!member.length) throw new Error('CHAT_FORBIDDEN');
          if (
            (await this.db.all("SELECT id FROM messages WHERE id=? AND kind='deleted'", packet.id))
              .length
          )
            return;
          const previous = (
            await this.db.all<{ revision: number }>(
              'SELECT revision FROM reaction_versions WHERE message_id=? AND peer=? AND emoji=?',
              packet.id,
              peer,
              packet.emoji,
            )
          )[0];
          if (previous && (packet.revision ?? 0) <= previous.revision) return;
          if (packet.revision !== undefined)
            await this.db.run(
              'INSERT INTO reaction_versions VALUES(?,?,?,?) ON CONFLICT(message_id,peer,emoji) DO UPDATE SET revision=excluded.revision',
              packet.id,
              peer,
              packet.emoji,
              packet.revision,
            );
          if (packet.active)
            await this.db.run(
              'INSERT OR IGNORE INTO reactions VALUES(?,?,?)',
              packet.id,
              peer,
              packet.emoji,
            );
          else
            await this.db.run(
              'DELETE FROM reactions WHERE message_id=? AND peer=? AND emoji=?',
              packet.id,
              peer,
              packet.emoji,
            );
        }
      });
    } catch {
      return false;
    }
    // Acknowledgment follows the receiving device's durable commit, never the relay's write.
    if (acknowledge && options.sendReceipts !== false)
      await this.transmit(peer, { type: 'ack', id: acknowledge });
    if (groupAck && options.sendReceipts !== false)
      await this.transmit(peer, {
        type: 'group_ack',
        ...(groupAck as { id: string; revision: number }),
      });
    this.changed();
    if (incoming) {
      this.incomingListeners.forEach((listener) => listener(incoming!));
      if ((incoming as IncomingMessage).type === 'message')
        this.conversationActivity({
          type: 'message',
          chat: (incoming as IncomingMessage).chat,
          outgoing: false,
        });
    }
    return true;
  }
  async markRead(chat: string, through = Number.MAX_SAFE_INTEGER) {
    await this.transaction(async () => {
      if (this.deliveryVersion === 2) {
        const rows = await this.db.all<{ id: string; sender: string }>(
          "SELECT m.id,m.sender FROM messages m JOIN contacts c ON c.public_key=m.sender WHERE m.chat_id=? AND m.sender!=? AND m.kind!='call' AND m.is_read=0 AND c.blocked=0 AND m.sequence<=? ORDER BY m.sequence LIMIT 1000",
          chat,
          this.own().key,
          through,
        );
        const peers = new Map<string, string[]>();
        for (const row of rows) {
          const ids = peers.get(row.sender) ?? [];
          ids.push(row.id);
          peers.set(row.sender, ids);
          await this.db.run('UPDATE messages SET is_read=1 WHERE id=?', row.id);
        }
        for (const [peer, ids] of peers)
          for (let offset = 0; offset < ids.length; offset += 100)
            await this.stageControl(peer, {
              type: 'read_ids',
              chat,
              ids: ids.slice(offset, offset + 100),
            });
        return;
      }
      await this.db.run(
        "UPDATE messages SET is_read=1 WHERE chat_id=? AND kind!='call' AND sequence<=?",
        chat,
        through,
      );
      const rows = await this.db.all<{ id: string; sender: string }>(
        "SELECT m.id,m.sender FROM messages m JOIN contacts c ON c.public_key=m.sender WHERE m.chat_id=? AND m.sender!=? AND m.kind!='call' AND c.blocked=0 AND m.sequence=(SELECT MAX(n.sequence) FROM messages n WHERE n.chat_id=m.chat_id AND n.sender=m.sender AND n.kind!='call' AND n.is_read=1)",
        chat,
        this.own().key,
      );
      for (const row of rows) {
        await this.db.run(
          "DELETE FROM control_outbox WHERE peer=? AND json_extract(packet,'$.type')='read' AND json_extract(packet,'$.chat')=?",
          row.sender,
          chat,
        );
        await this.stageControl(row.sender, { type: 'read', chat, through: row.id });
      }
    });
    this.changed();
    await this.flush().catch(() => undefined);
  }
  async react(id: string, emoji: string) {
    z.string().min(1).max(24).parse(emoji);
    const own = this.own().key;
    const row = (
      await this.db.all<{ chat_id: string }>(
        "SELECT chat_id FROM messages WHERE id=? AND kind!='deleted'",
        id,
      )
    )[0];
    if (!row) throw new Error('MESSAGE_MISSING');
    await this.transaction(async () => {
      const current =
        (
          await this.db.all(
            'SELECT emoji FROM reactions WHERE message_id=? AND peer=? AND emoji=?',
            id,
            own,
            emoji,
          )
        ).length > 0;
      await this.writeReaction(id, row.chat_id, own, emoji, !current);
      if (!current && isReactionEmoji(emoji)) {
        const previousUse = (
          await this.db.all<{ latest: number }>(
            'SELECT COALESCE(MAX(used_at),0) AS latest FROM recent_reactions',
          )
        )[0]!.latest;
        await this.db.run(
          'INSERT INTO recent_reactions VALUES(?,?) ON CONFLICT(emoji) DO UPDATE SET used_at=excluded.used_at',
          emoji,
          Math.max(this.now(), previousUse + 1),
        );
        await this.db.run(
          'DELETE FROM recent_reactions WHERE emoji NOT IN (SELECT emoji FROM recent_reactions ORDER BY used_at DESC,rowid DESC LIMIT 12)',
        );
      }
    });
    this.changed();
    await this.flush().catch(() => undefined);
  }
  // This helper is called only within the serialized local transaction.
  private async writeReaction(
    id: string,
    chat: string,
    own: string,
    emoji: string,
    active: boolean,
  ) {
    if (!active)
      await this.db.run(
        'DELETE FROM reactions WHERE message_id=? AND peer=? AND emoji=?',
        id,
        own,
        emoji,
      );
    else await this.db.run('INSERT INTO reactions VALUES(?,?,?)', id, own, emoji);
    const peers = await this.db.all<{ public_key: string }>(
      'SELECT m.public_key FROM members m JOIN contacts c ON c.public_key=m.public_key WHERE m.chat_id=? AND c.blocked=0 AND m.public_key!=?',
      chat,
      own,
    );
    const revision =
      ((
        await this.db.all<{ revision: number }>(
          'SELECT revision FROM reaction_versions WHERE message_id=? AND peer=? AND emoji=?',
          id,
          own,
          emoji,
        )
      )[0]?.revision ?? 0) + 1;
    if (revision > 2147483647) throw new Error('REACTION_LIMIT');
    await this.db.run(
      'INSERT INTO reaction_versions VALUES(?,?,?,?) ON CONFLICT(message_id,peer,emoji) DO UPDATE SET revision=excluded.revision',
      id,
      own,
      emoji,
      revision,
    );
    for (const member of peers)
      await this.stageControl(member.public_key, {
        type: 'reaction',
        id,
        emoji,
        active,
        revision,
      });
  }
  async vote(id: string, index: number) {
    const own = this.own().key;
    await this.transaction(async () => {
      const row = (
        await this.db.all<Media & { chat: string; left_group: number }>(
          "SELECT f.name,f.mime,f.bytes,f.duration,m.chat_id AS chat,c.left_group FROM messages m JOIN media f ON f.id=m.media_id JOIN chats c ON c.id=m.chat_id WHERE m.id=? AND m.kind='file'",
          id,
        )
      )[0];
      const card = readRichMedia(row);
      if (
        !row ||
        card?.type !== 'poll' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= card.options.length
      )
        throw new Error('POLL_INVALID');
      const members = await this.db.all<{ public_key: string }>(
        'SELECT public_key FROM members WHERE chat_id=?',
        row.chat,
      );
      if (
        row.left_group ||
        members.length < 2 ||
        !members.some((member) => member.public_key === own)
      )
        throw new Error('CHAT_FORBIDDEN');
      if (
        (
          await this.db.all(
            'SELECT m.public_key FROM members m JOIN contacts c ON c.public_key=m.public_key WHERE m.chat_id=? AND c.blocked=1',
            row.chat,
          )
        ).length
      )
        throw new Error('CONTACT_BLOCKED');
      const existing = await this.db.all<{ emoji: string }>(
        'SELECT emoji FROM reactions WHERE message_id=? AND peer=?',
        id,
        own,
      );
      const selected = voteEmoji[index]!;
      if (!card.multiple)
        for (const option of existing) {
          if (option.emoji !== selected && voteEmoji.some((emoji) => emoji === option.emoji))
            await this.writeReaction(id, row.chat, own, option.emoji, false);
        }
      await this.writeReaction(
        id,
        row.chat,
        own,
        selected,
        !existing.some((option) => option.emoji === selected),
      );
    });
    this.changed();
    await this.flush().catch(() => undefined);
  }
  private async stageControl(peer: string, packet: Packet) {
    const count = (
      await this.db.all<{ count: number }>('SELECT count(*) AS count FROM control_outbox')
    )[0]!.count;
    if (count >= 1000) throw new Error('DELIVERY_LOCAL_CAPACITY');
    await this.db.run(
      'INSERT INTO control_outbox VALUES(?,?,?,?)',
      this.uuid(),
      peer,
      JSON.stringify(packet),
      this.now(),
    );
  }
  async callHistory(before = Number.MAX_SAFE_INTEGER): Promise<LocalCall[]> {
    await this.tail;
    const rows = await this.db.all<
      Omit<LocalCall, 'media' | 'status' | 'direction'> & {
        body: string;
        chatKind: 'direct' | 'group';
      }
    >(
      `SELECT m.id, m.chat_id AS chatId, m.sender AS peer, c.title AS name, c.kind AS chatKind, m.body,
        1-m.is_read AS unseen, m.received_at AS endedAt, m.sequence
      FROM messages m JOIN chats c ON c.id=m.chat_id
      WHERE m.kind='call' AND m.sequence<?
      ORDER BY m.sequence DESC LIMIT 40`,
      before,
    );
    return rows.map(({ body, chatKind, ...row }) => ({
      ...row,
      ...(chatKind === 'group' ? { group: true } : {}),
      ...readCallRecord(body),
    }));
  }
  async recordCall(
    chat: string,
    id: string,
    peer: string,
    media: 'voice' | 'video',
    status: CallOutcome,
    direction: CallDirection = 'unknown',
  ) {
    if (status === 'missed' && direction !== 'incoming') throw new Error('CALL_OUTCOME_INVALID');
    let inserted = false;
    await this.transaction(async () => {
      if (!(await this.db.all('SELECT id FROM chats WHERE id=?', chat)).length) return;
      if ((await this.db.all('SELECT id FROM forgotten_messages WHERE id=?', id)).length) return;
      if ((await this.db.all('SELECT id FROM messages WHERE id=?', id)).length) return;
      await this.db.run(
        "INSERT OR IGNORE INTO messages(id,chat_id,sender,kind,body,sent_at,received_at,reply_to,media_id,is_read) VALUES(?,?,?,'call',?,?,?,NULL,NULL,?)",
        id,
        chat,
        peer,
        direction === 'unknown' ? media + ':' + status : media + ':' + direction + ':' + status,
        this.now(),
        this.now(),
        status === 'missed' ? 0 : 1,
      );
      if (await this.hasTable('delivered_call_invites'))
        await this.db.run('DELETE FROM delivered_call_invites WHERE peer=? AND id=?', peer, id);
      inserted = true;
    });
    this.changed();
    if (inserted && status === 'missed')
      this.incomingListeners.forEach((listener) => listener({ id, chat, type: 'missed-call' }));
  }
  async quickReactionChoices() {
    await this.tail;
    const recent = await this.db.all<{ emoji: string }>(
      'SELECT emoji FROM recent_reactions ORDER BY used_at DESC,rowid DESC LIMIT 12',
    );
    return [
      ...new Set([...recent.map((row) => row.emoji).filter(isReactionEmoji), ...quickReactions]),
    ].slice(0, 12);
  }
  async editMessage(id: string, body: string) {
    await this.changeOwnMessage(id, 'edit', body);
  }
  async deleteForEveryone(id: string) {
    await this.changeOwnMessage(id, 'delete', '');
  }
  private async changeOwnMessage(id: string, action: 'edit' | 'delete', body: string) {
    const own = this.own().key;
    await this.transaction(async () => {
      const row = (
        await this.db.all<{ sender: string; chat_id: string; kind: string }>(
          'SELECT sender,chat_id,kind FROM messages WHERE id=?',
          id,
        )
      )[0];
      if (
        !row ||
        row.sender !== own ||
        ['call', 'deleted'].includes(row.kind) ||
        (action === 'edit' && row.kind !== 'text')
      )
        throw new Error('MESSAGE_CHANGE_FORBIDDEN');
      const revision =
        ((
          await this.db.all<{ revision: number }>(
            'SELECT revision FROM message_changes WHERE message_id=? AND peer=?',
            id,
            own,
          )
        )[0]?.revision ?? 0) + 1;
      const change = packetSchema.parse({
        type: 'message_change',
        id,
        chat: row.chat_id,
        action,
        revision,
        body,
        changedAt: this.now(),
      }) as MessageChange;
      const recipients = await this.db.all<{ peer: string }>(
        'SELECT peer FROM deliveries WHERE message_id=?',
        id,
      );
      if (
        action === 'edit' &&
        !(
          await this.db.all(
            'SELECT 1 FROM chats c JOIN members m ON m.chat_id=c.id WHERE c.id=? AND c.left_group=0 AND m.public_key=?',
            row.chat_id,
            own,
          )
        ).length
      )
        throw new Error('GROUP_LEFT');
      if (action === 'delete') await this.purgeDeliveryMessage(id);
      await receiveMessageChange(this.db, own, own, change);
      for (const recipient of recipients) {
        if (
          action === 'edit' &&
          !(
            await this.db.all(
              'SELECT 1 FROM members WHERE chat_id=? AND public_key=?',
              row.chat_id,
              recipient.peer,
            )
          ).length
        )
          continue;
        await this.stageControl(recipient.peer, change);
      }
    });
    this.changed();
    await this.flush().catch(() => undefined);
  }
  async deleteLocalMessage(id: string) {
    await this.transaction(async () => {
      const row = (
        await this.db.all<{ sender: string; media_id: string | null }>(
          'SELECT sender,media_id FROM messages WHERE id=?',
          id,
        )
      )[0];
      if (!row) return;
      await this.purgeDeliveryMessage(id);
      await this.db.run('INSERT OR IGNORE INTO forgotten_messages VALUES(?,?)', id, row.sender);
      await this.db.run('DELETE FROM messages WHERE id=?', id);
      await this.db.run('DELETE FROM message_changes WHERE message_id=?', id);
      await this.db.run(
        "DELETE FROM control_outbox WHERE json_extract(packet,'$.type')!='message_change' AND (json_extract(packet,'$.id')=? OR json_extract(packet,'$.through')=?)",
        id,
        id,
      );
      if (row.media_id) await this.db.run('DELETE FROM media WHERE id=?', row.media_id);
    });
    // Deliberately no transport operation: the other participant owns their copy.
    this.changed();
  }
  async clearLocalHistory(chat: string) {
    await this.transaction(async () => {
      for (const row of await this.db.all<{ id: string }>(
        'SELECT id FROM messages WHERE chat_id=?',
        chat,
      ))
        await this.purgeDeliveryMessage(row.id);
      await this.db.run(
        'INSERT OR IGNORE INTO forgotten_messages SELECT id,sender FROM messages WHERE chat_id=?',
        chat,
      );
      const media = await this.db.all<{ media_id: string }>(
        'SELECT media_id FROM messages WHERE chat_id=? AND media_id IS NOT NULL',
        chat,
      );
      await this.db.run('DELETE FROM messages WHERE chat_id=?', chat);
      await this.db.run('DELETE FROM message_changes WHERE chat=?', chat);
      await this.db.run(
        "DELETE FROM control_outbox WHERE json_extract(packet,'$.type')!='message_change' AND (json_extract(packet,'$.chat')=? OR json_extract(packet,'$.id') IN (SELECT id FROM forgotten_messages))",
        chat,
      );
      for (const row of media) await this.db.run('DELETE FROM media WHERE id=?', row.media_id);
    });
    this.conversationActivity({ type: 'forget', chat });
    this.changed();
  }
  async retryMessage(id: string) {
    await this.transaction(() =>
      this.db.run('UPDATE deliveries SET held=0 WHERE message_id=? AND acknowledged=0', id),
    );
    await this.flush();
    this.changed();
  }
  async eraseLocalData() {
    this.transport?.stop();
    this.transport = null;
    await this.transaction(async () => {
      await this.db.run('DELETE FROM contact_requests');
      await this.db.run('DELETE FROM phone_registration');
      await this.db.run('DELETE FROM wake_capabilities');
      await this.db.run('DELETE FROM wake_revocations');
      await this.db.run('DELETE FROM control_outbox');
      await this.db.run('DELETE FROM delivery_block_changes');
      // Session keys and pending private descriptors are not chat history, but
      // account deletion must remove them too. Explicit names only, never an
      // arbitrary table name supplied by a backup or network peer.
      for (const table of [
        'delivery_media_chunks',
        'delivery_media_inbox',
        'delivery_media_outbox',
        'signal_inbox',
        'signal_outbox',
        'signal_peers',
        'signal_state',
        'signal_retries',
        'delivery_profile_clock',
        'delivery_profile_sent',
        'delivery_profile_received',
        'delivered_call_ends',
        'delivered_call_invites',
      ]) {
        if (
          (await this.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table))
            .length
        )
          await this.db.run(`DELETE FROM ${table}`);
      }
      for (const table of [...backupTables].reverse()) await this.db.run(`DELETE FROM ${table}`);
    });
    this.identity = null;
    this.enrollment = null;
    this.profile = emptyProfile();
    this.conversationActivity({ type: 'forget', chat: null });
    this.changed();
  }
  async snapshot(): Promise<string> {
    this.own();
    return this.transaction(async () => {
      const tables: Record<string, unknown> = {};
      for (const table of backupTables) {
        const rows = await this.db.all(`SELECT * FROM ${table} LIMIT 10001`);
        if (rows.length > 10000) throw new Error('BACKUP_SIZE_LIMIT');
        tables[table] = rows;
      }
      // A history export never contains live Signal ratchets. Mark migrated
      // exports distinctly so older restore code cannot claim account recovery.
      const result = JSON.stringify({ version: this.deliveryVersion === 2 ? 2 : 1, tables });
      if (new TextEncoder().encode(result).byteLength > 75_000_000)
        throw new Error('BACKUP_SIZE_LIMIT');
      return result;
    });
  }
  async restoreSnapshot(text: string) {
    if (text.length > 75_000_000) throw new Error('BACKUP_SIZE_LIMIT');
    const rowSchema = z.record(z.string(), z.union([z.string(), z.number().finite(), z.null()]));
    const archive = z
      .object({
        version: z.union([z.literal(1), z.literal(2)]),
        tables: z.record(z.string(), z.array(rowSchema).max(10000)),
      })
      .strict()
      .parse(JSON.parse(text));
    if (archive.version === 2) throw new Error('DELIVERY_RECOVERY_UNAVAILABLE');
    // Version-one archives made before profile cards have no contact_profiles table.
    if (!('contact_profiles' in archive.tables)) archive.tables.contact_profiles = [];
    if (!('contact_numbers' in archive.tables)) archive.tables.contact_numbers = [];
    if (!('message_changes' in archive.tables)) archive.tables.message_changes = [];
    if (!('recent_reactions' in archive.tables)) archive.tables.recent_reactions = [];
    if (
      Object.keys(archive.tables).length !== backupTables.length ||
      backupTables.some((table) => !archive.tables[table])
    )
      throw new Error('BACKUP_INVALID');
    const identities = archive.tables.identity;
    const record = identities?.[0];
    if (
      identities?.length !== 1 ||
      !record ||
      typeof record.public_key !== 'string' ||
      typeof record.secret !== 'string' ||
      typeof record.name !== 'string' ||
      !verifyIdentity(record.secret, record.public_key)
    )
      throw new Error('BACKUP_IDENTITY_INVALID');
    const restored = {
      key: record.public_key,
      secret: record.secret,
      name: z.string().trim().min(1).max(60).parse(record.name),
    };
    await this.transaction(async () => {
      if ((await this.db.all('SELECT singleton FROM identity')).length)
        throw new Error('RESTORE_REQUIRES_EMPTY_DEVICE');
      for (const table of backupTables) {
        const columns = (await this.db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map(
          (row) => row.name,
        );
        for (const row of archive.tables[table] ?? []) {
          // Original device archives had exactly these four identity columns.
          // Upgrade that known shape only; reject partial or injected schemas.
          const legacyIdentity = ['singleton', 'public_key', 'secret', 'name'];
          if (
            table === 'identity' &&
            Object.keys(row).length === 4 &&
            legacyIdentity.every((key) => key in row)
          ) {
            row.username = '';
            row.first_name = row.name ?? '';
            row.last_name = '';
          }
          if (
            table === 'identity' &&
            Object.keys(row).length === 7 &&
            [
              'singleton',
              'public_key',
              'secret',
              'name',
              'username',
              'first_name',
              'last_name',
            ].every((key) => key in row)
          ) {
            for (const key of ['headline', 'about', 'email', 'website', 'avatar']) row[key] = '';
          }
          if (table === 'messages' && !('edited_at' in row)) row.edited_at = 0;
          if (
            Object.keys(row).length !== columns.length ||
            columns.some((column) => !(column in row))
          )
            throw new Error('BACKUP_COLUMNS_INVALID');
          await this.db.run(
            `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
            ...columns.map((column) => row[column] ?? null),
          );
        }
      }
      // Recovery never silently resumes an old unsent message.
      await this.db.run('UPDATE deliveries SET held=1 WHERE acknowledged=0');
      if ((await this.db.all('PRAGMA foreign_key_check')).length)
        throw new Error('BACKUP_RELATIONSHIP_INVALID');
      for (const row of await this.db.all<{ phone: string; public_key: string }>(
        'SELECT * FROM contact_numbers',
      )) {
        internationalPhone.parse(row.phone);
        peerKey.parse(row.public_key);
      }
      // Validate profile fields before committing an imported archive.
      await this.readProfile();
      for (const row of await this.db.all<ProfileRow>('SELECT * FROM contact_profiles'))
        profileFromRow(row);
    });
    this.identity = restored;
    this.profile = await this.readProfile();
    this.enrollment = null;
    this.changed();
  }
  async close() {
    this.closing = true;
    this.transport?.stop();
    this.transport = null;
    await this.tail;
    await this.db.close();
    this.identity = null;
    this.enrollment = null;
    this.listeners.clear();
  }
}

const backupTables = [
  'identity',
  'contacts',
  'contact_numbers',
  'contact_profiles',
  'chats',
  'members',
  'media',
  'messages',
  'deliveries',
  'reactions',
  'group_deliveries',
  'forgotten_messages',
  'message_changes',
  'recent_reactions',
] as const;

type ProfileRow = {
  username: string;
  first_name: string;
  last_name: string;
  headline: string;
  about: string;
  email: string;
  website: string;
  avatar: string;
};
function profileFromRow(row?: ProfileRow) {
  return localProfile.parse({
    username: row?.username ?? '',
    firstName: row?.first_name ?? '',
    lastName: row?.last_name ?? '',
    headline: row?.headline ?? '',
    about: row?.about ?? '',
    email: row?.email ?? '',
    website: row?.website ?? '',
    avatar: row?.avatar ?? '',
  });
}
