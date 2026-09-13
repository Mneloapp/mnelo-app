import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import { deliveryDatabase } from './delivery-fixture';
import {
  eventICS,
  googleEventURL,
  pollResults,
  readRichMedia,
  richMedia,
  richSchema,
  voteEmoji,
  type PollCard,
  type EventCard,
} from '../../src/messenger/rich-message';
import { packetSchema, type Packet } from '../../src/messenger/model';
const poll: PollCard = {
  version: 1,
  type: 'poll',
  question: 'Which day?',
  options: ['Saturday', 'Sunday'],
  multiple: false,
};
const event: EventCard = {
  version: 1,
  type: 'event',
  title: 'Meet, greet; plan',
  start: Date.UTC(2026, 8, 14, 10),
  end: Date.UTC(2026, 8, 14, 11),
  location: 'Meeting room',
  notes: 'Line one\nLine two',
};
test('polls/events remain valid file messages on existing clients; malformed attachments stay ordinary files', () => {
  for (const card of [poll, event]) {
    const media = richMedia(card);
    assert.deepEqual(readRichMedia(media), card);
    assert.ok(
      packetSchema.safeParse({
        type: 'message',
        id: randomUUID(),
        chat: randomUUID(),
        sentAt: Date.now(),
        kind: 'file',
        body: card.type === 'poll' ? card.question : card.title,
        media,
        replyTo: null,
      }).success,
    );
  }
  assert.equal(readRichMedia({ ...richMedia(poll), mime: 'application/json' }), null);
  assert.equal(readRichMedia({ ...richMedia(poll), bytes: '!!' }), null);
  assert.equal(readRichMedia({ ...richMedia(poll), bytes: 'a'.repeat(24001) }), null);
  for (const card of [
    { ...poll, options: ['same', ' Same '] },
    { ...poll, options: ['only'] },
    { ...event, end: event.start },
    { ...event, start: NaN },
    { ...event, end: Infinity },
    { ...event, unexpected: true },
  ])
    assert.equal(richSchema.safeParse(card).success, false);
});
test('calendar export preserves UTC instants, escapes multiline content, and folds UTF-8 without injection', () => {
  const url = new URL(googleEventURL(event));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20260914T100000Z/20260914T110000Z');
  assert.equal(url.searchParams.get('text'), event.title);
  const value = {
    ...event,
    title: 'Meeting '.repeat(24),
    notes: 'Hello\r\nBEGIN:VEVENT\nDESCRIPTION:abc,def;ghi\\end',
  };
  const ics = eventICS(value);
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 2); // The second occurrence is escaped text, never a new line/property.
  assert.equal(ics.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length, 1);
  assert.ok(ics.includes('DESCRIPTION:Hello\\nBEGIN:VEVENT\\nDESCRIPTION:abc\\,def\\;ghi\\\\'));
  assert.ok(ics.includes('UID:'));
  assert.ok(ics.includes('DTSTART:20260914T100000Z'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  const uid = (text: string) => text.split('\r\n').find((line) => line.startsWith('UID:'));
  assert.equal(uid(eventICS(value)), uid(ics));
});
test('poll counts each authenticated participant once; duplicate/malformed reactions cannot inflate single answers', () => {
  const result = pollResults(poll, [
    { peer: 'a', emoji: voteEmoji[0] },
    { peer: 'a', emoji: voteEmoji[1] },
    { peer: 'a', emoji: voteEmoji[0] },
    { peer: 'b', emoji: voteEmoji[1] },
    { peer: 'c', emoji: 'hi' },
  ]);
  assert.equal(result.voters, 2);
  assert.deepEqual(result.counts, [1, 1]);
  assert.deepEqual(
    pollResults({ ...poll, multiple: true }, [
      { peer: 'a', emoji: voteEmoji[0] },
      { peer: 'a', emoji: voteEmoji[1] },
    ]).counts,
    [1, 1],
  );
});
test('votes switch atomically, survive offline/reordered delivery, toggle off and reject blocked/left chats', async () => {
  const a = deliveryDatabase(),
    b = deliveryDatabase();
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID),
    be = new DeviceMessenger(b.db, randomBytes, randomUUID);
  try {
    await ae.initialize();
    await be.initialize();
    const ar = await ae.createIdentity('Fixture A'),
      br = await be.createIdentity('Fixture B');
    const chat = await ae.trustContact({ key: br.key, name: 'Fixture B' });
    await be.trustContact({ key: ar.key, name: 'Fixture A' });
    const id = await ae.send(chat, poll.question, { kind: 'file', media: richMedia(poll) });
    assert.equal(
      await be.receive(ar.key, {
        type: 'message',
        id,
        chat,
        sentAt: Date.now(),
        kind: 'file',
        body: poll.question,
        media: richMedia(poll),
        replyTo: null,
      }),
      true,
    );
    await ae.vote(id, 0);
    await ae.vote(id, 1);
    assert.deepEqual(
      (await ae.reactions(id)).map((row) => row.emoji),
      [voteEmoji[1]],
    );
    const packets = await a.db.all<{ packet: string }>('SELECT packet FROM control_outbox');
    for (const row of [...packets].reverse())
      assert.equal(await be.receive(ar.key, JSON.parse(row.packet)), true);
    for (const row of packets) await be.receive(ar.key, JSON.parse(row.packet));
    assert.deepEqual(
      (await be.reactions(id)).map((row) => row.emoji),
      [voteEmoji[1]],
    );
    await ae.vote(id, 1);
    assert.equal((await ae.reactions(id)).length, 0);
    await assert.rejects(ae.vote(id, 2), /POLL_INVALID/);
    await a.db.run('UPDATE contacts SET blocked=1 WHERE public_key=?', br.key);
    await assert.rejects(ae.vote(id, 0), /CONTACT_BLOCKED/);
    await a.db.run('UPDATE contacts SET blocked=0 WHERE public_key=?', br.key);
    await a.db.run('UPDATE chats SET left_group=1 WHERE id=?', chat);
    await assert.rejects(ae.vote(id, 0), /CHAT_FORBIDDEN/);
    assert.equal(
      (await ae.sharedContent(chat, 'docs')).items.some((item) => item.id === id),
      false,
    );
  } finally {
    await a.db.close();
    await b.db.close();
  }
});
test('a full durable queue rolls back the old choice and new choice together', async () => {
  const a = deliveryDatabase(),
    b = deliveryDatabase();
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID),
    be = new DeviceMessenger(b.db, randomBytes, randomUUID);
  try {
    await ae.initialize();
    await be.initialize();
    await ae.createIdentity('Fixture A');
    const br = await be.createIdentity('Fixture B');
    const chat = await ae.trustContact({ key: br.key, name: 'Fixture B' });
    const id = await ae.send(chat, poll.question, { kind: 'file', media: richMedia(poll) });
    await ae.vote(id, 0);
    const packet: Packet = { type: 'reaction', id, emoji: voteEmoji[0], active: true, revision: 1 };
    for (let i = 1; i < 999; i++)
      await a.db.run(
        'INSERT INTO control_outbox VALUES(?,?,?,?)',
        randomUUID(),
        br.key,
        JSON.stringify(packet),
        Date.now(),
      );
    await assert.rejects(ae.vote(id, 1), /DELIVERY_LOCAL_CAPACITY/);
    assert.deepEqual(
      (await ae.reactions(id)).map((row) => row.emoji),
      [voteEmoji[0]],
    );
    assert.equal(
      (await a.db.all<{ count: number }>('SELECT count(*) AS count FROM control_outbox'))[0]?.count,
      999,
    );
  } finally {
    await a.db.close();
    await b.db.close();
  }
});
