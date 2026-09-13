import type { CallControl, DeviceCalls } from '../calls';
import type { DeviceMessenger } from '../engine';
import { directChatId } from '../crypto';
import { groupCallSchema, acceptsGroupCall, type GroupCall } from '../group-call';
import { DELIVERY_TTL_MS } from './schema';

export const CALL_RING_WINDOW_MS = 60000;
type PendingCall = {
  peer: string;
  id: string;
  media: 'voice' | 'video';
  created_at: number;
  phase: 'incoming' | 'connecting' | 'active';
  group_context: string | null;
};
// Durable call-id tombstones prevent a late invite from ringing again after
// cancellation/restart. Audio/video never enters this journal or server store.
export class DeliveredCallControl {
  private ready: Promise<void> | null = null;
  constructor(
    private readonly engine: DeviceMessenger,
    private readonly calls: Pick<DeviceCalls, 'receive'> & Partial<Pick<DeviceCalls, 'snapshot'>>,
    private readonly now = Date.now,
  ) {}
  private initialize() {
    return (this.ready ??= this.engine.deliveryAtomic(async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS delivered_call_ends(peer TEXT NOT NULL,id TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(peer,id));
        CREATE TABLE IF NOT EXISTS delivered_call_invites(peer TEXT NOT NULL,id TEXT NOT NULL,media TEXT NOT NULL,created_at INTEGER NOT NULL,phase TEXT NOT NULL DEFAULT 'incoming',PRIMARY KEY(peer,id));
      `);
      const columns = await db.all<{ name: string }>('PRAGMA table_info(delivered_call_invites)');
      if (!columns.some((column) => column.name === 'group_context'))
        await db.exec('ALTER TABLE delivered_call_invites ADD COLUMN group_context TEXT');
    }));
  }
  async track() {
    const call = this.calls.snapshot?.();
    if (!call?.incoming || !['connecting', 'active'].includes(call.status)) return;
    await this.initialize();
    await this.engine.deliveryAtomic((db) =>
      db.run(
        'UPDATE delivered_call_invites SET phase=? WHERE peer=? AND id=?',
        call.status,
        call.peer,
        call.id,
      ),
    );
  }
  async recover() {
    await this.initialize();
    await this.track();
    const rows = await this.engine.deliveryAtomic((db) =>
      db.all<PendingCall>('SELECT * FROM delivered_call_invites ORDER BY created_at LIMIT 20'),
    );
    for (const row of rows) {
      let group: GroupCall | undefined;
      if (row.group_context) {
        try {
          group = groupCallSchema.parse(JSON.parse(row.group_context));
        } catch {
          await this.engine.deliveryAtomic((db) =>
            db.run('DELETE FROM delivered_call_invites WHERE peer=? AND id=?', row.peer, row.id),
          );
          continue;
        }
      }
      if (group && !(await acceptsGroupCall(this.engine, group))) {
        await this.engine.deliveryAtomic((db) =>
          db.run('DELETE FROM delivered_call_invites WHERE peer=? AND id=?', row.peer, row.id),
        );
        continue;
      }
      const live = this.calls.snapshot?.();
      if (live?.id === row.id && live.peer === row.peer) continue;
      if (
        !(await this.engine.acceptsPeer(row.peer)) ||
        (await this.engine.hasReceivedMessage(row.peer, row.id))
      ) {
        await this.engine.deliveryAtomic((db) =>
          db.run('DELETE FROM delivered_call_invites WHERE peer=? AND id=?', row.peer, row.id),
        );
        continue;
      }
      if (row.phase !== 'incoming') {
        const own = this.engine.currentIdentity();
        if (own)
          await this.engine.recordCall(
            group?.chat ?? directChatId(own.key, row.peer),
            row.id,
            row.peer,
            row.media,
            'failed',
            'incoming',
          );
        continue;
      }
      await this.receive(
        row.peer,
        {
          type: 'call',
          id: row.id,
          media: row.media,
          action: 'invite',
          ...(group ? { group } : {}),
        },
        { createdAt: row.created_at },
      );
    }
  }
  async receive(peer: string, control: CallControl, context: { createdAt: number }) {
    if (!(await this.engine.acceptsPeer(peer))) return;
    const own = this.engine.currentIdentity();
    if (!own) return;
    if (
      control.group &&
      (!control.group.participants.includes(peer) ||
        (control.action === 'invite' && control.group.host !== peer) ||
        !(await acceptsGroupCall(this.engine, control.group)))
    )
      return;
    const completed = await this.engine.hasReceivedMessage(peer, control.id);
    const expired = this.now() - context.createdAt >= CALL_RING_WINDOW_MS;
    await this.initialize();
    const terminal = await this.engine.deliveryAtomic(async (db) => {
      await db.run('DELETE FROM delivered_call_ends WHERE expires_at<=?', this.now());
      if (
        control.action === 'end' ||
        control.action === 'decline' ||
        (control.action === 'invite' && expired)
      )
        await db.run(
          'INSERT INTO delivered_call_ends VALUES(?,?,?) ON CONFLICT(peer,id) DO UPDATE SET expires_at=MAX(expires_at,excluded.expires_at)',
          peer,
          control.id,
          context.createdAt + DELIVERY_TTL_MS,
        );
      return (
        (await db.all('SELECT id FROM delivered_call_ends WHERE peer=? AND id=?', peer, control.id))
          .length > 0
      );
    });
    if (control.action === 'invite' && (expired || terminal || completed)) {
      if (!completed)
        await this.engine.recordCall(
          control.group?.chat ?? directChatId(own.key, peer),
          control.id,
          peer,
          control.media,
          'missed',
          'incoming',
        );
      return;
    }
    if (control.action === 'accept' && (expired || terminal || completed)) return;
    if (control.action === 'invite')
      await this.engine.deliveryAtomic((db) =>
        db.run(
          'INSERT OR IGNORE INTO delivered_call_invites(peer,id,media,created_at,group_context) VALUES(?,?,?,?,?)',
          peer,
          control.id,
          control.media,
          context.createdAt,
          control.group ? JSON.stringify(control.group) : null,
        ),
      );
    await this.calls.receive(
      peer,
      control,
      control.action === 'invite'
        ? Math.max(1, context.createdAt + CALL_RING_WINDOW_MS - this.now())
        : undefined,
    );
  }
}
