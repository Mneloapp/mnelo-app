import { z } from 'zod';
import type { CallDirection, CallOutcome } from './call-record';
import { groupProfile } from './group-profile';

export const peerKey = z.string().regex(/^[a-f0-9]{64}$/);
export const MAX_CALL_PARTICIPANTS = 8;
export const groupCallSchema = z
  .object({
    chat: z.string().min(1).max(80),
    host: peerKey,
    participants: z.array(peerKey).min(2).max(MAX_CALL_PARTICIPANTS),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.participants).size === value.participants.length &&
      value.participants.includes(value.host),
  );
export type GroupCall = z.infer<typeof groupCallSchema>;
const identifier = z.string().uuid();
export const contactSchema = z
  .object({ key: peerKey, name: z.string().trim().min(1).max(60) })
  .strict();
export type Contact = z.infer<typeof contactSchema> & { blocked: boolean; phone?: string };
export type LocalIdentity = { key: string; secret: string; name: string };
export type LocalCall = {
  group?: boolean;
  id: string;
  chatId: string;
  peer: string;
  name: string;
  media: 'voice' | 'video';
  status: CallOutcome;
  direction: CallDirection;
  unseen: number;
  endedAt: number;
  sequence: number;
};
export type Chat = {
  group_profile?: string;
  group_profile_revision?: number;
  peer?: string;
  id: string;
  kind: 'direct' | 'group';
  title: string;
  owner: string;
  revision: number;
  left_group: number;
  unread: number;
  preview: string;
  previewKind: string;
  activity: number;
  updated: number;
};
export type LocalMessage = {
  editedAt?: number;
  id: string;
  chatId: string;
  sender: string;
  kind: string;
  body: string;
  sentAt: number;
  receivedAt: number;
  replyTo: string | null;
  attachment: string | null;
  status: 'pending' | 'delivered' | 'received' | 'read';
  sequence: number;
};
export type Media = { name: string; mime: string; bytes: string; duration: number | null };
export type SQLValue = string | number | null | Uint8Array;
export interface LocalDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: SQLValue[]): Promise<void>;
  all<T>(sql: string, ...params: SQLValue[]): Promise<T[]>;
  close(): Promise<void>;
  observeSuspension?(listener: () => void): () => void;
  isSuspended?(): boolean;
}

// Application packets travel inside authenticated Signal envelopes in delivery
// v2, or the legacy authenticated DTLS channel while migration is disabled.
export const packetSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('group_profile'),
      id: identifier,
      revision: z.number().int().min(1),
      profile: groupProfile,
    })
    .strict(),
  z
    .object({
      type: z.literal('message_change'),
      id: identifier,
      chat: z.string().min(1).max(80),
      action: z.enum(['edit', 'delete']),
      revision: z.number().int().min(1).max(2147483647),
      body: z.string().max(8000),
      changedAt: z.number().int().nonnegative().max(8640000000000000),
    })
    .strict(),
  z
    .object({
      type: z.literal('call'),
      id: identifier,
      action: z.enum(['invite', 'accept', 'decline', 'end']),
      media: z.enum(['voice', 'video']),
      group: groupCallSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('message'),
      id: identifier,
      chat: z.string().min(1).max(80),
      sentAt: z.number().int().nonnegative().max(8640000000000000),
      kind: z.enum(['text', 'image', 'file', 'voice', 'location', 'contact']),
      body: z.string().max(8000),
      replyTo: identifier.nullable(),
      media: z
        .object({
          name: z.string().min(1).max(180),
          mime: z.string().max(100),
          bytes: z.string().max(14_000_000),
          duration: z.number().min(0).max(3600).nullable(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
  z
    .object({ type: z.literal('group_ack'), id: identifier, revision: z.number().int().min(1) })
    .strict(),
  z.object({ type: z.literal('group_leave'), id: identifier }).strict(),
  z.object({ type: z.literal('ack'), id: identifier }).strict(),
  z.object({ type: z.literal('read'), chat: z.string().max(80), through: identifier }).strict(),
  z
    .object({
      type: z.literal('read_ids'),
      chat: z.string().min(1).max(80),
      ids: z
        .array(identifier)
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  z
    .object({
      type: z.literal('reaction'),
      id: identifier,
      emoji: z.string().min(1).max(24),
      active: z.boolean(),
      revision: z.number().int().min(1).max(2147483647).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('group'),
      id: identifier,
      title: z.string().trim().min(1).max(80),
      revision: z.number().int().min(1),
      members: z.array(contactSchema).min(1).max(16),
    })
    .strict(),
]);
export type Packet = z.infer<typeof packetSchema>;
export interface PeerTransport {
  // Acceptance is never recipient delivery. Durable implementations resolve only
  // after locally journaling the operation, independently of receiver presence.
  send(peer: string, packet: Packet): boolean;
  sendDurable?(
    peer: string,
    packet: Packet,
    event?: { id: string; createdAt: number },
  ): Promise<boolean>;
  stop(): void;
}

export const localSchema = `
PRAGMA foreign_keys = ON;
PRAGMA secure_delete = ON;
PRAGMA temp_store = MEMORY;
CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), public_key TEXT NOT NULL UNIQUE, secret TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS phone_registration (singleton INTEGER PRIMARY KEY CHECK(singleton=1), phone TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS phone_enrollment (singleton INTEGER PRIMARY KEY CHECK(singleton=1) REFERENCES phone_registration(singleton) ON DELETE CASCADE, service TEXT NOT NULL, test_only INTEGER NOT NULL CHECK(test_only IN (0,1)), verified_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contacts (public_key TEXT PRIMARY KEY, name TEXT NOT NULL, blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)));
CREATE TABLE IF NOT EXISTS contact_requests (public_key TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, received_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contact_numbers (phone TEXT PRIMARY KEY CHECK(length(phone) BETWEEN 8 AND 16 AND substr(phone,1,1)='+'), public_key TEXT NOT NULL UNIQUE REFERENCES contacts(public_key) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS contact_profiles (public_key TEXT PRIMARY KEY REFERENCES contacts(public_key) ON DELETE CASCADE, username TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, headline TEXT NOT NULL, about TEXT NOT NULL, email TEXT NOT NULL, website TEXT NOT NULL, avatar TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS phonebook_name_cache (singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner TEXT NOT NULL, phone TEXT NOT NULL, bindings TEXT NOT NULL, aliases TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_profile_clock(singleton INTEGER PRIMARY KEY CHECK(singleton=1),revision INTEGER NOT NULL,hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_profile_sent(peer TEXT PRIMARY KEY REFERENCES contacts(public_key) ON DELETE CASCADE,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_profile_received(peer TEXT PRIMARY KEY REFERENCES contacts(public_key) ON DELETE CASCADE,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wake_capabilities(peer TEXT PRIMARY KEY REFERENCES contacts(public_key) ON DELETE CASCADE, own TEXT NOT NULL, remote TEXT);
CREATE TABLE IF NOT EXISTS wake_revocations(capability TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('direct','group')), title TEXT NOT NULL, owner TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, left_group INTEGER NOT NULL DEFAULT 0 CHECK(left_group IN (0,1)));
CREATE TABLE IF NOT EXISTS members (chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, public_key TEXT NOT NULL, PRIMARY KEY(chat_id,public_key));
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, bytes TEXT NOT NULL, duration REAL);
CREATE TABLE IF NOT EXISTS messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, sender TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, sent_at INTEGER NOT NULL, received_at INTEGER NOT NULL, reply_to TEXT, media_id TEXT REFERENCES media(id), is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)));
CREATE INDEX IF NOT EXISTS message_cursor ON messages(chat_id, sequence DESC);
CREATE INDEX IF NOT EXISTS message_export_cursor ON messages(chat_id, sent_at, sequence);
CREATE INDEX IF NOT EXISTS call_cursor ON messages(sequence DESC) WHERE kind='call';
CREATE TABLE IF NOT EXISTS deliveries (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, peer TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1)), held INTEGER NOT NULL DEFAULT 0 CHECK(held IN (0,1)), read_at INTEGER, PRIMARY KEY(message_id,peer));
CREATE TABLE IF NOT EXISTS message_receipt_info (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, peer TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1)), delivered_at INTEGER, read_at INTEGER, PRIMARY KEY(message_id,peer));
CREATE TABLE IF NOT EXISTS reactions (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, peer TEXT NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY(message_id,peer,emoji));
CREATE TABLE IF NOT EXISTS reaction_versions (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,peer TEXT NOT NULL,emoji TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(message_id,peer,emoji));
CREATE TABLE IF NOT EXISTS group_deliveries (chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, peer TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(chat_id,peer));
CREATE TABLE IF NOT EXISTS forgotten_messages (id TEXT PRIMARY KEY, peer TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS message_changes (message_id TEXT NOT NULL, peer TEXT NOT NULL, chat TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL CHECK(action IN ('edit','delete')), body TEXT NOT NULL, changed_at INTEGER NOT NULL, PRIMARY KEY(message_id,peer));
CREATE TABLE IF NOT EXISTS call_quick_replies (position INTEGER PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recent_reactions (emoji TEXT PRIMARY KEY, used_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS control_outbox (id TEXT PRIMARY KEY,peer TEXT NOT NULL,packet TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS delivery_block_changes (peer TEXT PRIMARY KEY,blocked INTEGER NOT NULL CHECK(blocked IN (0,1)),revision TEXT NOT NULL);

`;
