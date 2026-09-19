import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  deliveryEnvelope,
  DELIVERY_TTL_MS,
  type DeliveryEnvelope,
  type QueuedEnvelope,
} from '../src/messenger/delivery/schema';
import { peerKey } from '../src/messenger/model';
import { wakeEvent, type WakeEvent } from '../src/messenger/wake-protocol';

type DeliveryRow = {
  sender: string;
  recipient: string;
  id: string;
  type: 2 | 3;
  ciphertext: string;
  created_at: number;
  accepted_at: number;
  expires_at: number;
  notify: string | null;
};
export type DeliveryNotification = {
  sender: string;
  recipient: string;
  id: string;
  event: string;
  created_at: number;
  expires_at: number;
  attempts: number;
  ring_done: number;
};
type Receipt = { hash: string; accepted_at: number; expires_at: number; delivered: number };
const MAX_RECIPIENT_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

// This is a ciphertext delivery spool, not a conversation/history database.
// Authentication and recipient/cohort authorization are mandatory at every entry.
export class DeliveryStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly access: {
      registered(key: string): boolean;
      canContact(from: string, to: string): boolean;
    },
    private readonly now = Date.now,
  ) {
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) throw new Error('DELIVERY_SCHEMA_UNSUPPORTED');
    db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA secure_delete=ON;
      PRAGMA journal_mode=DELETE;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS delivery_receipts (
        sender TEXT NOT NULL, recipient TEXT NOT NULL, id TEXT NOT NULL,
        hash TEXT NOT NULL, accepted_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered IN (0,1)),
        PRIMARY KEY(sender,recipient,id)
      );
      CREATE INDEX IF NOT EXISTS delivery_expiry ON delivery_receipts(expires_at);
      CREATE TABLE IF NOT EXISTS delivery_spool (
        sender TEXT NOT NULL, recipient TEXT NOT NULL, id TEXT NOT NULL,
        type INTEGER NOT NULL CHECK(type IN (2,3)), created_at INTEGER NOT NULL, ciphertext TEXT NOT NULL,
        bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=90000),
        PRIMARY KEY(sender,recipient,id),
        FOREIGN KEY(sender,recipient,id) REFERENCES delivery_receipts(sender,recipient,id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS delivery_recipient ON delivery_spool(recipient);
      CREATE TABLE IF NOT EXISTS delivery_notifications(
        sender TEXT NOT NULL,recipient TEXT NOT NULL,id TEXT NOT NULL,event TEXT NOT NULL,created_at INTEGER NOT NULL,next_attempt INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,ring_done INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(sender,recipient,id),FOREIGN KEY(sender,recipient,id) REFERENCES delivery_spool(sender,recipient,id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS delivery_notification_due ON delivery_notifications(next_attempt);
      CREATE TABLE IF NOT EXISTS delivery_blocks (
        owner TEXT NOT NULL, peer TEXT NOT NULL, PRIMARY KEY(owner,peer), CHECK(owner<>peer)
      );
      PRAGMA user_version=1;
    `);
    if (
      !(db.prepare('PRAGMA table_info(delivery_spool)').all() as { name: string }[]).some(
        (row) => row.name === 'notify',
      )
    )
      db.exec('ALTER TABLE delivery_spool ADD COLUMN notify TEXT');
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private authorize(actor: string) {
    peerKey.parse(actor);
    if (!this.access.registered(actor)) throw new Error('DELIVERY_UNAUTHORIZED');
  }
  allowed(from: string, to: string) {
    return (
      this.access.registered(from) &&
      this.access.registered(to) &&
      this.access.canContact(from, to) &&
      !this.db
        .prepare('SELECT 1 FROM delivery_blocks WHERE (owner=? AND peer=?) OR (owner=? AND peer=?)')
        .get(from, to, to, from)
    );
  }
  prune() {
    // Receipts (opaque IDs/hashes only) expire at the ORIGINAL acceptance deadline.
    // CASCADE also removes unacknowledged ciphertext. No TTL extension on retry.
    this.db.prepare('DELETE FROM delivery_receipts WHERE expires_at<=?').run(this.now());
  }
  submit(actor: string, input: DeliveryEnvelope) {
    this.authorize(actor);
    const envelope = deliveryEnvelope.parse(input);
    if (
      envelope.createdAt > this.now() + 300000 ||
      envelope.createdAt + DELIVERY_TTL_MS <= this.now()
    )
      throw new Error('DELIVERY_EXPIRED');
    if (actor === envelope.recipient || !this.allowed(actor, envelope.recipient))
      throw new Error('DELIVERY_UNAVAILABLE');
    const hash = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
    return this.transaction(() => {
      this.prune();
      const previous = this.db
        .prepare('SELECT * FROM delivery_receipts WHERE sender=? AND recipient=? AND id=?')
        .get(actor, envelope.recipient, envelope.id) as Receipt | undefined;
      if (previous) {
        if (previous.hash !== hash) throw new Error('DELIVERY_CONFLICT');
        return { acceptedAt: previous.accepted_at, expiresAt: previous.expires_at };
      }
      const recipient = this.db
        .prepare(
          'SELECT count(*) AS count, coalesce(sum(bytes),0) AS bytes FROM delivery_spool WHERE recipient=?',
        )
        .get(envelope.recipient) as { count: number; bytes: number };
      const total = this.db
        .prepare('SELECT coalesce(sum(bytes),0) AS bytes FROM delivery_spool')
        .get() as { bytes: number };
      const sent = this.db
        .prepare('SELECT count(*) AS count FROM delivery_receipts WHERE sender=? AND accepted_at>?')
        .get(actor, this.now() - 86400000) as { count: number };
      const receipts = this.db.prepare('SELECT count(*) AS count FROM delivery_receipts').get() as {
        count: number;
      };
      if (
        receipts.count >= 200000 ||
        recipient.count >= 1000 ||
        recipient.bytes + envelope.ciphertext.length > MAX_RECIPIENT_BYTES ||
        total.bytes + envelope.ciphertext.length > MAX_TOTAL_BYTES ||
        sent.count >= 5000
      )
        throw new Error('DELIVERY_CAPACITY');
      const acceptedAt = this.now(),
        expiresAt = Math.min(acceptedAt, envelope.createdAt) + DELIVERY_TTL_MS;
      this.db
        .prepare(
          'INSERT INTO delivery_receipts(sender,recipient,id,hash,accepted_at,expires_at) VALUES(?,?,?,?,?,?)',
        )
        .run(actor, envelope.recipient, envelope.id, hash, acceptedAt, expiresAt);
      this.db
        .prepare(
          'INSERT INTO delivery_spool(sender,recipient,id,type,created_at,ciphertext,bytes,notify) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          actor,
          envelope.recipient,
          envelope.id,
          envelope.type,
          envelope.createdAt,
          envelope.ciphertext,
          envelope.ciphertext.length,
          envelope.notify ? JSON.stringify(envelope.notify) : null,
        );
      if (envelope.notify)
        this.db
          .prepare(
            'INSERT INTO delivery_notifications(sender,recipient,id,event,created_at,next_attempt) VALUES(?,?,?,?,?,?)',
          )
          .run(
            actor,
            envelope.recipient,
            envelope.id,
            JSON.stringify(envelope.notify),
            envelope.createdAt,
            this.now(),
          );
      return { acceptedAt, expiresAt };
    });
  }
  fetch(
    actor: string,
    after?: { acceptedAt: number; sender: string; id: string },
  ): QueuedEnvelope[] {
    this.authorize(actor);
    this.prune();
    const rows = this.db
      .prepare(
        `SELECT s.*,r.accepted_at,r.expires_at FROM delivery_spool s
      JOIN delivery_receipts r USING(sender,recipient,id) WHERE s.recipient=? ${after ? 'AND (r.accepted_at,s.sender,s.id)>(?,?,?)' : ''}
      ORDER BY r.accepted_at,s.sender,s.id LIMIT 20`,
      )
      .all(actor, ...(after ? [after.acceptedAt, after.sender, after.id] : [])) as DeliveryRow[];
    const result: QueuedEnvelope[] = [];
    for (const row of rows) {
      if (!this.access.registered(row.sender) || !this.allowed(row.sender, actor)) {
        this.db
          .prepare('DELETE FROM delivery_receipts WHERE sender=? AND recipient=? AND id=?')
          .run(row.sender, actor, row.id);
        continue;
      }
      result.push({
        version: 2,
        id: row.id,
        sender: row.sender,
        recipient: actor,
        type: row.type,
        createdAt: row.created_at,
        ciphertext: row.ciphertext,
        acceptedAt: row.accepted_at,
        expiresAt: row.expires_at,
        ...(row.notify ? { notify: wakeEvent.parse(JSON.parse(row.notify)) } : {}),
      });
    }
    return result;
  }
  acknowledge(actor: string, sender: string, id: string) {
    return this.acknowledgeBatch(actor, [{ sender, id }]);
  }
  acknowledgeBatch(actor: string, acknowledgements: readonly { sender: string; id: string }[]) {
    this.authorize(actor);
    for (const row of acknowledgements) peerKey.parse(row.sender);
    if (!acknowledgements.length) return;
    return this.transaction(() => {
      const remove = this.db.prepare(
        'DELETE FROM delivery_spool WHERE sender=? AND recipient=? AND id=?',
      );
      const delivered = this.db.prepare(
        'UPDATE delivery_receipts SET delivered=1 WHERE sender=? AND recipient=? AND id=?',
      );
      for (const { sender, id } of acknowledgements) {
        remove.run(sender, actor, id);
        delivered.run(sender, actor, id);
      }
    });
  }
  hasPending(actor: string, sender: string, id: string) {
    this.authorize(actor);
    this.prune();
    return (
      this.allowed(sender, actor) &&
      Boolean(
        this.db
          .prepare('SELECT 1 FROM delivery_spool WHERE recipient=? AND sender=? AND id=?')
          .get(actor, sender, id),
      )
    );
  }
  notifications(): (Omit<DeliveryNotification, 'event'> & { event: WakeEvent })[] {
    this.prune();
    const rows = this.db
      .prepare(
        'SELECT n.*,r.expires_at FROM delivery_notifications n JOIN delivery_receipts r USING(sender,recipient,id) WHERE n.next_attempt<=? ORDER BY n.next_attempt,n.id LIMIT 20',
      )
      .all(this.now()) as DeliveryNotification[];
    return rows.map((row) => ({ ...row, event: wakeEvent.parse(JSON.parse(row.event)) }));
  }
  notificationResult(
    row: Pick<DeliveryNotification, 'sender' | 'recipient' | 'id'>,
    retry?: { nextAt: number; attempts: number; ringDone: boolean },
  ) {
    if (retry)
      this.db
        .prepare(
          'UPDATE delivery_notifications SET next_attempt=?,attempts=?,ring_done=? WHERE sender=? AND recipient=? AND id=?',
        )
        .run(
          retry.nextAt,
          retry.attempts,
          Number(retry.ringDone),
          row.sender,
          row.recipient,
          row.id,
        );
    else
      this.db
        .prepare('DELETE FROM delivery_notifications WHERE sender=? AND recipient=? AND id=?')
        .run(row.sender, row.recipient, row.id);
  }
  block(actor: string, peer: string, blocked: boolean) {
    this.authorize(actor);
    peerKey.parse(peer);
    if (actor === peer) throw new Error('DELIVERY_UNAVAILABLE');
    this.transaction(() => {
      if (blocked) {
        const count = this.db
          .prepare('SELECT count(*) AS count FROM delivery_blocks WHERE owner=?')
          .get(actor) as { count: number };
        if (
          count.count >= 1000 &&
          !this.db
            .prepare('SELECT 1 FROM delivery_blocks WHERE owner=? AND peer=?')
            .get(actor, peer)
        )
          throw new Error('DELIVERY_CAPACITY');
        this.db.prepare('INSERT OR IGNORE INTO delivery_blocks VALUES(?,?)').run(actor, peer);
        this.db
          .prepare(
            'DELETE FROM delivery_receipts WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',
          )
          .run(actor, peer, peer, actor);
      } else
        this.db.prepare('DELETE FROM delivery_blocks WHERE owner=? AND peer=?').run(actor, peer);
    });
  }
  unlink(actor: string) {
    this.transaction(() => {
      this.db
        .prepare('DELETE FROM delivery_receipts WHERE sender=? OR recipient=?')
        .run(actor, actor);
      this.db.prepare('DELETE FROM delivery_blocks WHERE owner=? OR peer=?').run(actor, actor);
    });
  }
  close() {
    this.db.close();
  }
}
