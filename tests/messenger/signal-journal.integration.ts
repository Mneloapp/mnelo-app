import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { createKeys } from '../../src/messenger/crypto';
import { SignalJournal } from '../../src/messenger/delivery/journal';
import { DELIVERY_TTL_MS } from '../../src/messenger/delivery/schema';
import type { LocalDatabase } from '../../src/messenger/model';
import { NodeSignal } from './node-signal';

function fixture() {
  const db = new DatabaseSync(':memory:');
  let fail = false,
    tail: Promise<unknown> = Promise.resolve();
  const adapter: LocalDatabase = {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, ...params) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, ...params: import('../../src/messenger/model').SQLValue[]) {
      return db.prepare(sql).all(...params) as T[];
    },
    async close() {
      db.close();
    },
  };
  const atomic = <T>(work: (db: LocalDatabase) => Promise<T>) => {
    const operation = tail.then(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const value = await work(adapter);
        if (fail) {
          fail = false;
          throw new Error('FIXTURE_COMMIT_FAILED');
        }
        db.exec('COMMIT');
        return value;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
    tail = operation.catch(() => undefined);
    return operation;
  };
  const root = createKeys(randomBytes);
  return {
    root,
    db,
    journal: () => new SignalJournal(atomic, new NodeSignal(), root),
    failCommit: () => {
      fail = true;
    },
  };
}
test('receipts and current messages precede historical backlog while failed records remain durable', async () => {
  const f = fixture(),
    journal = f.journal(),
    peer = createKeys(randomBytes).key;
  try {
    await journal.initialize();
    const now = Date.now(),
      first = randomUUID();
    await journal.enqueue(peer, first, 'OLD_FAILED', now - 300000);
    await journal.failed('send', peer, first, now - 300000, 'message-error');
    for (let i = 0; i < 20; i++)
      await journal.enqueue(peer, randomUUID(), `OLD_${i}`, now - 300000);
    const current = randomUUID(),
      receipt = randomUUID();
    await journal.enqueue(peer, current, 'CURRENT', now);
    f.db
      .prepare('INSERT INTO signal_inbox(sender,id,hash,body,created_at) VALUES(?,?,?,?,?)')
      .run(peer, current, 'FIXTURE_VERIFIED', 'INCOMING', now);
    await journal.applied(peer, current, { id: receipt, body: 'RECEIPT' });
    const due = await journal.readyOutgoing();
    assert.deepEqual(
      due.slice(0, 2).map((row) => row.id),
      [receipt, current],
    );
    assert.ok(!due.some((row) => row.id === first));
    assert.equal((await journal.pending())[0]?.id, first, 'the failed record is retained');
    await journal.uploaded(receipt);
    await journal.uploaded(current);
    assert.equal(
      (await journal.readyOutgoing())[0]?.body,
      'OLD_0',
      'the historical backlog still progresses',
    );
  } finally {
    f.db.close();
  }
});
test('Signal journal persists ciphertext with the ratchet and recovers inbox across crashes without re-decrypting or repeating side effects', async () => {
  const a = fixture(),
    b = fixture();
  try {
    const aj = a.journal(),
      bj = b.journal();
    const ak = await aj.initialize(),
      bk = await bj.initialize();
    const { oneTime: ap, ...aid } = ak,
      { oneTime: bp, ...bid } = bk;
    await aj.pin({ ...bid, owner: b.root.key, signature: bj.binding(bk) });
    await bj.pin({ ...aid, owner: a.root.key, signature: aj.binding(ak) });
    assert.equal(ap.length, 1);
    const id = randomUUID(),
      body = JSON.stringify({ text: 'FICTIONAL_JOURNAL_CRASH_TEST' });
    await aj.enqueue(b.root.key, id, body);
    a.failCommit();
    await assert.rejects(aj.seal(id, { ...bid, oneTime: bp[0]! }), /COMMIT_FAILED/);
    assert.equal((await aj.pending())[0]?.wire, null);
    const wire = await aj.seal(id, { ...bid, oneTime: bp[0]! });
    assert.deepEqual(await a.journal().seal(id), wire);
    assert.equal(await aj.enqueue(b.root.key, randomUUID(), body), id);
    const queued = {
      ...wire,
      sender: a.root.key,
      acceptedAt: wire.createdAt,
      expiresAt: wire.createdAt + DELIVERY_TTL_MS,
    };
    b.failCommit();
    await assert.rejects(bj.receive(queued), /COMMIT_FAILED/);
    assert.deepEqual(await bj.inbox(), []);
    await b.journal().receive(queued);
    assert.equal((await b.journal().inbox())[0]?.body, body);
    await bj.receive(queued);
    assert.equal((await bj.inbox()).length, 1);
    const receipt = { id: randomUUID(), body: JSON.stringify({ type: 'ack', id }) };
    b.failCommit();
    await assert.rejects(bj.applied(a.root.key, id, receipt), /COMMIT_FAILED/);
    assert.equal((await bj.inbox()).length, 1);
    assert.equal((await bj.pending()).length, 0);
    await bj.applied(a.root.key, id, receipt);
    assert.equal((await bj.pending()).length, 1);
    // A lost HTTP ACK response remains retryable after process reconstruction.
    assert.deepEqual(
      (await b.journal().acknowledgements()).map((row) => ({ ...row })),
      [{ sender: a.root.key, id }],
    );
    await bj.acknowledged(a.root.key, id);
    assert.deepEqual(await bj.acknowledgements(), []);
    await b.journal().receive(queued);
    assert.deepEqual(await bj.inbox(), []);
    assert.equal(
      (b.db.prepare('SELECT body FROM signal_inbox').get() as { body: string }).body,
      '',
    );
  } finally {
    a.db.close();
    b.db.close();
  }
});
test('mailbox header substitution cannot change authenticated sender, recipient, ID or timestamp', async () => {
  const a = fixture(),
    b = fixture();
  try {
    const aj = a.journal(),
      bj = b.journal(),
      ak = await aj.initialize(),
      bk = await bj.initialize();
    const { oneTime: ap, ...aid } = ak,
      { oneTime: bp, ...bid } = bk;
    assert.equal(ap.length, 1);
    await aj.pin({ ...bid, owner: b.root.key, signature: bj.binding(bk) });
    await bj.pin({ ...aid, owner: a.root.key, signature: aj.binding(ak) });
    const id = randomUUID();
    await aj.enqueue(b.root.key, id, 'FIXTURE_HEADER_BINDING');
    const wire = await aj.seal(id, { ...bid, oneTime: bp[0]! });
    const queued = {
      ...wire,
      sender: a.root.key,
      acceptedAt: wire.createdAt,
      expiresAt: wire.createdAt + DELIVERY_TTL_MS,
    };
    await assert.rejects(bj.receive({ ...queued, id: randomUUID() }), /BINDING_INVALID/);
    await assert.rejects(
      bj.receive({ ...queued, createdAt: queued.createdAt + 1 }),
      /BINDING_INVALID/,
    );
    await assert.rejects(
      bj.receive({ ...queued, notify: { kind: 'call', id: randomUUID(), video: true } }),
      /BINDING_INVALID/,
    );
    await bj.receive(queued);
    assert.equal((await bj.inbox())[0]?.body, 'FIXTURE_HEADER_BINDING');
  } finally {
    a.db.close();
    b.db.close();
  }
});
