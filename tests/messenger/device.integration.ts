import { test } from 'node:test';
import jpeg from 'jpeg-js';
import { DeviceWake } from '../../src/messenger/wake-client';
import type { PhoneClient } from '../../src/messenger/phone-client';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import {
  createKeys,
  directChatId,
  sealArchive,
  openArchive,
  sign,
  verify,
} from '../../src/messenger/crypto';
import type { LocalDatabase, Packet } from '../../src/messenger/model';
import { emptyProfile } from '../../src/messenger/local-profile';
import { emptyGroupProfile, readGroupProfile } from '../../src/messenger/group-profile';

function database(): LocalDatabase {
  const db = new DatabaseSync(':memory:');
  return {
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
}
async function pair() {
  const a = new DeviceMessenger(database(), randomBytes, randomUUID);
  const b = new DeviceMessenger(database(), randomBytes, randomUUID);
  await a.initialize();
  await b.initialize();
  const alice = await a.createIdentity('Development Alice');
  const bob = await b.createIdentity('Development Bob');
  const chat = await a.trustContact({ key: bob.key, name: bob.name });
  await b.trustContact({ key: alice.key, name: alice.name });
  return { a, b, alice, bob, chat };
}

test('group details survive restart, synchronize separately from membership, and reject non-owner or stale updates', async () => {
  const { a, b, alice, bob } = await pair();
  const sent: Packet[] = [];
  a.attachTransport({
    send: () => false,
    sendDurable: async (_peer, packet) => {
      sent.push(packet);
      return true;
    },
    stop() {},
  });
  try {
    const profile = {
      ...emptyGroupProfile(),
      avatar: Buffer.from(
        jpeg.encode({ width: 4, height: 4, data: Buffer.alloc(64, 255) }, 60).data,
      ).toString('base64'),
      headline: 'Weekend plans',
      about: 'Synthetic group description',
      website: 'example.com',
      email: 'group@example.com',
    };
    const id = await a.createGroup('მეგობრები', [bob.key], profile);
    const membership = sent.find((packet) => packet.type === 'group')!;
    const details = sent.find((packet) => packet.type === 'group_profile')!;
    assert.equal(
      await b.receive(alice.key, details),
      false,
      'early metadata is retained for retry until membership arrives',
    );
    assert.equal(await b.receive(alice.key, membership), true);
    assert.equal(await b.receive(alice.key, details), true);
    assert.deepEqual(readGroupProfile(await b.chat(id)), profile);
    assert.deepEqual(readGroupProfile(await a.chat(id)), profile);
    await b.initialize();
    assert.deepEqual(
      readGroupProfile(await b.chat(id)),
      profile,
      'additive migration/reopen retains details',
    );
    const restored = new DeviceMessenger(database(), randomBytes, randomUUID);
    await restored.initialize();
    try {
      await restored.restoreSnapshot(await b.snapshot());
      assert.deepEqual(
        readGroupProfile(await restored.chat(id)),
        profile,
        'photo and details survive a full backup restore',
      );
    } finally {
      await restored.close();
    }
    const stranger = createKeys(randomBytes);
    await b.trustContact({ key: stranger.key, name: 'Other member' });
    assert.equal(await b.receive(stranger.key, { ...details, revision: 2 }), false);
    sent.length = 0;
    await a.updateGroup(id, 'ახალი სახელი', [bob.key], {
      ...profile,
      about: 'Updated',
      website: '',
    });
    const newer = sent.find((packet) => packet.type === 'group_profile')!;
    assert.equal(
      await b.receive(
        alice.key,
        sent.find((packet) => packet.type === 'group')!,
      ),
      true,
    );
    assert.equal(await b.receive(alice.key, newer), true);
    assert.equal(await b.receive(alice.key, details), true, 'replay is harmless');
    assert.equal(readGroupProfile(await b.chat(id)).about, 'Updated');
    assert.equal(readGroupProfile(await b.chat(id)).website, '');
    assert.equal((await b.chat(id))?.title, 'ახალი სახელი');
    await assert.rejects(b.updateGroup(id, 'Forged', [alice.key], profile), /GROUP_FORBIDDEN/);
    await assert.rejects(
      a.updateGroup(id, 'Invalid', [bob.key], { ...profile, website: 'javascript:alert(1)' }),
    );
    assert.equal(
      readGroupProfile(await a.chat(id)).about,
      'Updated',
      'failed validation leaves data intact',
    );
  } finally {
    await a.close();
    await b.close();
  }
});
test('a new message bypasses more than fifty unacknowledged older deliveries', async () => {
  const { a, b, chat } = await pair();
  const transmitted: Packet[] = [];
  try {
    for (let i = 0; i < 60; i++) await a.send(chat, `OLDER_${i}`, { deferDelivery: true });
    a.attachTransport({
      send: () => false,
      async sendDurable(_peer, packet) {
        transmitted.push(packet);
        return true;
      },
      stop() {},
    });
    const id = await a.send(chat, 'CURRENT_MESSAGE');
    assert.ok(transmitted.some((packet) => packet.type === 'message' && packet.id === id));
    assert.equal(transmitted.filter((packet) => packet.type === 'message').length, 1);
    assert.equal(
      (await a.messages(chat)).find((message) => message.id === id)?.status,
      'pending',
      'queueing alone is never a receipt',
    );
  } finally {
    await a.close();
    await b.close();
  }
});
test('attention counts only committed inbound messages; duplicates, blocks, calls and own messages do not inflate unread', async () => {
  const { a, b, alice, bob, chat } = await pair();
  const events: unknown[] = [];
  a.subscribeIncoming((event) => events.push(event));
  const packet = {
    type: 'message',
    id: randomUUID(),
    chat,
    kind: 'text',
    body: 'Development private content',
    sentAt: Date.now(),
    media: null,
    replyTo: null,
  } as const;
  assert.equal(await a.receive(bob.key, packet), true);
  assert.equal(await a.receive(bob.key, packet), true);
  await a.send(chat, 'Own message');
  const through = (await a.messages(chat))[0]!.sequence;
  const missed = randomUUID();
  await a.recordCall(chat, missed, bob.key, 'voice', 'missed', 'incoming');
  await a.recordCall(chat, missed, bob.key, 'voice', 'missed', 'incoming');
  await a.recordCall(chat, randomUUID(), bob.key, 'voice', 'declined', 'incoming');
  await a.recordCall(chat, randomUUID(), bob.key, 'voice', 'unanswered', 'outgoing');
  assert.deepEqual(await a.attentionCounts(), { messages: 1, calls: 1 });
  assert.deepEqual(events, [
    { id: packet.id, chat, type: 'message' },
    { id: missed, chat, type: 'missed-call' },
  ]);
  assert.equal((await a.chatPage('unread')).rows[0]?.unread, 1);
  const callThrough = (await a.callHistory())[0]!.sequence;
  await a.receive(bob.key, { ...packet, id: randomUUID() });
  await a.markRead(chat, through);
  assert.deepEqual(
    await a.attentionCounts(),
    { messages: 1, calls: 1 },
    'an older visible snapshot cannot read a newer arrival or acknowledge a missed call',
  );
  const laterMissed = randomUUID();
  await a.recordCall(chat, laterMissed, bob.key, 'video', 'missed', 'incoming');
  await a.markCallsSeen(callThrough);
  assert.deepEqual(
    await a.attentionCounts(),
    { messages: 1, calls: 1 },
    'viewing call history cannot clear a later call or unread messages',
  );
  await a.deleteLocalMessage(laterMissed);
  await a.block(bob.key, true);
  assert.equal(await a.receive(bob.key, { ...packet, id: randomUUID() }), false);
  assert.deepEqual(await a.attentionCounts(), { messages: 1, calls: 0 });
  await b.recordCall(chat, laterMissed, alice.key, 'voice', 'ended', 'outgoing');
  await a.clearLocalHistory(chat);
  assert.deepEqual(await a.attentionCounts(), { messages: 0, calls: 0 });
  assert.equal((await b.callHistory()).length, 1, 'peer history is independent');
  await a.close();
  await b.close();
});
test('Unicode chat search and unread/group filters work beyond the first 100 conversations with bounded pages', async () => {
  const db = database();
  const a = new DeviceMessenger(db, randomBytes, randomUUID);
  await a.initialize();
  const own = await a.createIdentity('Development search');
  for (let i = 0; i < 105; i++) {
    const id = String(i).padStart(4, '0');
    await db.run(
      'INSERT INTO chats(id,kind,title,owner,revision) VALUES(?,?,?,?,0)',
      id,
      i === 104 ? 'group' : 'direct',
      i === 104 ? 'ᲯᲒᲣᲤᲘ მეგობრები' : 'Development ' + id,
      own.key,
    );
  }
  assert.equal((await a.chatPage('all', 'ჯგუფი')).rows[0]?.id, '0104');
  assert.equal((await a.chatPage('group')).rows[0]?.id, '0104');
  await db.run(
    "INSERT INTO messages(id,chat_id,sender,kind,body,sent_at,received_at) VALUES(?,'0104',?,'text','Development',1,1)",
    randomUUID(),
    'b'.repeat(64),
  );
  assert.equal((await a.chatPage('unread')).rows[0]?.id, '0104');
  const ids: string[] = [];
  let cursor: import('../../src/messenger/engine').ChatCursor | undefined;
  do {
    const page = await a.chatPage('all', '', cursor);
    assert.ok(page.rows.length <= 40);
    ids.push(...page.rows.map((row) => row.id));
    cursor = page.next;
  } while (cursor);
  assert.equal(ids.length, 105);
  assert.equal(new Set(ids).size, 105);
  assert.deepEqual(await a.attentionCounts(), { messages: 1, calls: 0 });
  await a.close();
});
test('group creation supports an older native delivery table whose revision has no SQL default', async () => {
  const db = database();
  const engine = new DeviceMessenger(db, randomBytes, randomUUID);
  await engine.initialize();
  await engine.createIdentity('Development legacy device');
  const peer = createKeys(randomBytes);
  await engine.trustContact({ key: peer.key, name: 'Development peer' });
  await db.exec(
    'DROP TABLE group_deliveries; CREATE TABLE group_deliveries(chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, peer TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(chat_id,peer));',
  );
  const id = await engine.createGroup('Development group', [peer.key]);
  await engine.updateGroup(id, 'Development renamed group', [peer.key]);
  assert.equal((await engine.chatPage('group')).rows[0]?.id, id);
  assert.equal(
    (
      await db.all<{ revision: number }>(
        'SELECT revision FROM group_deliveries WHERE chat_id=?',
        id,
      )
    )[0]?.revision,
    0,
  );
  await engine.close();
});
test('missed call acknowledgement survives backup/restore without inventing direction on historical calls', async () => {
  const { a, b, bob, chat } = await pair();
  await a.recordCall(chat, randomUUID(), bob.key, 'voice', 'ended');
  const missed = randomUUID();
  await a.recordCall(chat, missed, bob.key, 'video', 'missed', 'incoming');
  await assert.rejects(
    a.recordCall(chat, randomUUID(), bob.key, 'voice', 'missed', 'outgoing'),
    /CALL_OUTCOME_INVALID/,
  );
  const restored = new DeviceMessenger(database(), randomBytes, randomUUID);
  await restored.initialize();
  await restored.restoreSnapshot(await a.snapshot());
  assert.deepEqual(await restored.attentionCounts(), { messages: 0, calls: 1 });
  const history = await restored.callHistory();
  assert.equal(history[1]?.direction, 'unknown');
  await restored.markCallsSeen(history[0]!.sequence);
  await restored.recordCall(chat, missed, bob.key, 'video', 'missed', 'incoming');
  assert.equal(
    (await restored.attentionCounts()).calls,
    0,
    'duplicate cannot reopen an acknowledged badge',
  );
  await a.close();
  await b.close();
  await restored.close();
});
test('call history pages only local calls and deleting an entry leaves the other participant copy intact', async () => {
  const { a, b, alice, bob, chat } = await pair();
  const wire: Packet[] = [];
  a.attachTransport({
    send(_peer, packet) {
      wire.push(packet);
      return true;
    },
    stop() {},
  });
  await a.send(chat, 'Development message excluded from call history');
  const ids = Array.from({ length: 43 }, () => randomUUID());
  for (const [index, id] of ids.entries())
    await a.recordCall(
      chat,
      id,
      bob.key,
      index % 2 ? 'video' : 'voice',
      index % 2 ? 'failed' : 'ended',
    );
  const newest = ids.at(-1)!;
  await a.recordCall(chat, newest, bob.key, 'voice', 'ended');
  await b.recordCall(chat, newest, alice.key, 'voice', 'ended');
  const first = await a.callHistory();
  const second = await a.callHistory(first.at(-1)!.sequence);
  assert.equal(first.length, 40);
  assert.equal(second.length, 3);
  assert.equal(new Set([...first, ...second].map((item) => item.id)).size, 43);
  assert.equal(first[0]?.id, newest);
  assert.equal(first[0]?.name, bob.name);
  assert.equal(first[0]?.media, 'voice');
  assert.equal(first[0]?.status, 'ended');
  assert.equal(first[1]?.media, 'video');
  assert.equal(first[1]?.status, 'failed');
  assert.equal((await a.callHistory(second.at(-1)!.sequence)).length, 0);
  await a.deleteLocalMessage(newest);
  await a.recordCall(chat, newest, bob.key, 'voice', 'ended');
  assert.equal(
    (await a.callHistory()).some((item) => item.id === newest),
    false,
  );
  assert.equal((await b.callHistory())[0]?.id, newest);
  assert.equal(wire.length, 1, 'recording and deleting local calls sends no transport packets');
  await a.close();
  await b.close();
});
test('phone display cache stays encrypted locally, restores without false verification, and erases locally', async () => {
  const { a, b } = await pair();
  await a.rememberPhone('+12025550101');
  assert.equal(await a.phoneNumber(), '+12025550101');
  const archive = JSON.parse(await a.snapshot());
  assert.equal(
    archive.tables.phone_registration,
    undefined,
    'backup cannot claim a current server registration',
  );
  await a.eraseLocalData();
  assert.equal(await a.phoneNumber(), null);
  await a.close();
  await b.close();
});
test('offline message stays only on sender; acknowledgment requires receiver commit', async () => {
  const { a, b, bob, chat } = await pair();
  let accepted: Packet | undefined;
  a.attachTransport({
    send(_peer, packet) {
      accepted = packet;
      return true;
    },
    stop() {},
  });
  await a.send(chat, 'Development private text');
  assert.equal((await a.messages(chat))[0]?.status, 'pending');
  assert.equal((await b.messages(chat)).length, 0);
  assert.equal(accepted?.type, 'message');
  assert.equal(
    await a.receive(bob.key, { type: 'ack', id: (await a.messages(chat))[0]!.id }),
    true,
  );
  assert.equal((await a.messages(chat))[0]?.status, 'delivered');
  await a.close();
  await b.close();
});
test('each participant owns a durable copy; local deletion cannot delete or reintroduce peer history', async () => {
  const { a, b, alice, bob, chat } = await pair();
  const wire: Packet[] = [];
  const acks: Packet[] = [];
  a.attachTransport({
    send(_peer, packet) {
      wire.push(packet);
      return true;
    },
    stop() {},
  });
  b.attachTransport({
    send(_peer, packet) {
      acks.push(packet);
      return true;
    },
    stop() {},
  });
  const id = await a.send(chat, 'Private on both devices');
  const packet = wire[0]!;
  assert.equal(await b.receive(alice.key, packet), true);
  assert.equal((await b.messages(chat))[0]?.body, 'Private on both devices');
  await a.receive(bob.key, acks[0]);
  await a.deleteLocalMessage(id);
  assert.equal((await a.messages(chat)).length, 0);
  assert.equal((await b.messages(chat)).length, 1);
  assert.equal(wire.length, 1, 'local deletion emitted no packet');
  await b.deleteLocalMessage(id);
  assert.equal(await b.receive(alice.key, packet), true);
  assert.equal(
    (await b.messages(chat)).length,
    0,
    'retry cannot resurrect locally deleted content',
  );
  await a.close();
  await b.close();
});
test('unknown peer, blocked peer and unrelated conversation inserts fail', async () => {
  const { a, b, alice, bob, chat } = await pair();
  let packet: Packet | undefined;
  a.attachTransport({
    send(_peer, value) {
      packet = value;
      return true;
    },
    stop() {},
  });
  await a.send(chat, 'Development denied content');
  const stranger = createKeys(randomBytes);
  assert.equal(await b.receive(stranger.key, packet), false);
  assert.equal(await b.receive(alice.key, { ...packet, chat: randomUUID() }), false);
  await b.block(alice.key);
  assert.equal(await b.receive(alice.key, packet), false);
  assert.equal((await b.messages(chat)).length, 0);
  assert.equal(directChatId(alice.key, bob.key), directChatId(bob.key, alice.key));
  await a.close();
  await b.close();
});
test('spoofed acknowledgment cannot mark another peer delivery complete', async () => {
  const { a, b, bob, chat } = await pair();
  const stranger = createKeys(randomBytes);
  await a.trustContact({ key: stranger.key, name: 'Development third peer' });
  const id = await a.send(chat, 'Needs Bob acknowledgment');
  await a.receive(stranger.key, { type: 'ack', id });
  assert.equal((await a.messages(chat))[0]?.status, 'pending');
  await a.receive(bob.key, { type: 'ack', id });
  assert.equal((await a.messages(chat))[0]?.status, 'delivered');
  await a.close();
  await b.close();
});
test('independent group copies and sender membership authorization', async () => {
  const { a, b, alice, bob } = await pair();
  const packets: Packet[] = [];
  a.attachTransport({
    send(_peer, packet) {
      packets.push(packet);
      return true;
    },
    stop() {},
  });
  const group = await a.createGroup('Development group', [bob.key]);
  await a.send(group, 'Group history');
  for (const packet of packets) assert.equal(await b.receive(alice.key, packet), true);
  assert.equal((await b.messages(group)).length, 1);
  await a.clearLocalHistory(group);
  assert.equal((await b.messages(group)).length, 1);
  const impostor = createKeys(randomBytes);
  await b.trustContact({ key: impostor.key, name: 'Development impostor' });
  assert.equal(
    await b.receive(impostor.key, {
      type: 'group',
      id: group,
      title: 'Hijacked',
      revision: 2,
      members: [
        { key: impostor.key, name: 'Impostor' },
        { key: bob.key, name: 'Bob' },
      ],
    }),
    false,
  );
  assert.equal((await b.chat(group))?.title, 'Development group');
  await a.close();
  await b.close();
});
test('backup integrity/wrong-key rejection and signed identity tamper rejection', () => {
  const key = randomBytes(32).toString('hex');
  const data = new TextEncoder().encode('Development private archive');
  const archive = sealArchive(data, key, randomBytes);
  assert.deepEqual(openArchive(archive, key), data);
  assert.throws(() => openArchive(archive, randomBytes(32).toString('hex')));
  const tampered = archive.slice();
  tampered[14] = tampered[14]! ^ 1;
  assert.throws(() => openArchive(tampered, key));
  const identity = createKeys(randomBytes);
  const signature = sign(identity.secret, 'mnelo-signal-v1:payload');
  assert.equal(verify(identity.key, signature, 'mnelo-signal-v1:payload'), true);
  assert.equal(verify(identity.key, signature, 'mnelo-signal-v1:changed'), false);
});

test('full backup restores independent state and holds old outbox until explicit retry', async () => {
  const { a, b, bob, chat } = await pair();
  const id = await a.send(chat, 'Development pending recovery');
  const archive = await a.snapshot();
  const recovered = new DeviceMessenger(database(), randomBytes, randomUUID);
  await recovered.initialize();
  await recovered.restoreSnapshot(archive);
  assert.equal(recovered.currentIdentity()?.key, a.currentIdentity()?.key);
  assert.equal((await recovered.messages(chat))[0]?.body, 'Development pending recovery');
  const sent: Packet[] = [];
  recovered.attachTransport({
    send(_key, packet) {
      sent.push(packet);
      return true;
    },
    stop() {},
  });
  await recovered.flush();
  assert.equal(sent.length, 0);
  await recovered.retryMessage(id);
  assert.equal(sent[0]?.type, 'message');
  await assert.rejects(() => recovered.restoreSnapshot(archive), /RESTORE_REQUIRES_EMPTY_DEVICE/);
  await recovered.clearLocalHistory(chat);
  assert.equal((await a.messages(chat)).length, 1);
  await recovered.block(bob.key);
  assert.equal(await a.acceptsPeer(bob.key), true);
  await recovered.eraseLocalData();
  assert.equal(recovered.currentIdentity(), null);
  assert.ok(a.currentIdentity());
  await a.close();
  await b.close();
  await recovered.close();
});
test('migrated history export cannot silently restore an incomplete Signal identity', async () => {
  const { a, b, chat } = await pair();
  const recovered = new DeviceMessenger(database(), randomBytes, randomUUID);
  try {
    await recovered.initialize();
    await a.send(chat, 'Synthetic preserved history');
    await a.enableSignalDelivery();
    const exported = await a.snapshot();
    assert.equal(JSON.parse(exported).version, 2);
    assert.ok(exported.includes('Synthetic preserved history'));
    assert.ok(!exported.includes('signal_state') && !exported.includes('signal_peers'));
    await assert.rejects(
      () => recovered.restoreSnapshot(exported),
      /DELIVERY_RECOVERY_UNAVAILABLE/,
    );
    assert.equal(recovered.currentIdentity(), null);
    assert.equal((await a.messages(chat)).length, 1);
  } finally {
    await a.close();
    await b.close();
    await recovered.close();
  }
});
test('backup schema and identity tampering roll back without partial restore', async () => {
  const { a, b } = await pair();
  const archive = JSON.parse(await a.snapshot());
  const recovered = new DeviceMessenger(database(), randomBytes, randomUUID);
  await recovered.initialize();
  archive.tables.identity[0].secret = '00'.repeat(32);
  await assert.rejects(
    () => recovered.restoreSnapshot(JSON.stringify(archive)),
    /BACKUP_IDENTITY_INVALID/,
  );
  assert.equal(recovered.currentIdentity(), null);
  const invalid = JSON.parse(await a.snapshot());
  invalid.tables.contacts[0].unexpected = 'injected';
  await assert.rejects(
    () => recovered.restoreSnapshot(JSON.stringify(invalid)),
    /BACKUP_COLUMNS_INVALID/,
  );
  assert.equal(recovered.currentIdentity(), null);
  assert.equal((await recovered.contacts()).length, 0);
  await a.close();
  await b.close();
  await recovered.close();
});
test('group membership updates reach offline peers; removal retains existing history and rejects new sends', async () => {
  const { a, b, alice, bob } = await pair();
  const wire: Packet[] = [];
  a.attachTransport({
    send(_key, packet) {
      wire.push(packet);
      return true;
    },
    stop() {},
  });
  const id = await a.createGroup('Development group', [bob.key]);
  await a.send(id, 'Kept history');
  for (const packet of wire.splice(0)) await b.receive(alice.key, packet);
  await a.updateGroup(id, 'Updated group', []);
  for (const packet of wire.splice(0)) await b.receive(alice.key, packet);
  assert.equal((await b.chat(id))?.title, 'Updated group');
  assert.equal((await b.messages(id)).length, 1);
  await assert.rejects(() => b.send(id, 'Cannot send after removal'), /CHAT_FORBIDDEN/);
  await assert.rejects(() => b.updateGroup(id, 'Hijacked', [alice.key]), /GROUP_FORBIDDEN/);
  await a.close();
  await b.close();
});
test('peer read receipts cannot mark a different recipient read', async () => {
  const { a, b, alice, bob, chat } = await pair();
  const wire: Packet[] = [];
  const returns: Packet[] = [];
  a.attachTransport({
    send(_key, packet) {
      wire.push(packet);
      return true;
    },
    stop() {},
  });
  b.attachTransport({
    send(_key, packet) {
      returns.push(packet);
      return true;
    },
    stop() {},
  });
  const id = await a.send(chat, 'Read receipt fixture');
  await b.receive(alice.key, wire[0]);
  await b.markRead(chat);
  for (const packet of returns) await a.receive(bob.key, packet);
  assert.equal((await a.messages(chat))[0]?.status, 'read');
  const unknown = createKeys(randomBytes);
  assert.equal(await a.receive(unknown.key, { type: 'read', chat, through: id }), false);
  await a.close();
  await b.close();
});

test('enrollment survives restart, is separate from phone display, and never travels in a backup', async () => {
  const db = database();
  const engine = new DeviceMessenger(db, randomBytes, randomUUID);
  await engine.initialize();
  await engine.createIdentity();
  assert.equal(engine.currentEnrollment(), null);
  await engine.rememberPhone('+12025550101');
  assert.equal(
    engine.currentEnrollment(),
    null,
    'display-only legacy caches do not bypass verification',
  );
  const receipt = {
    phone: '+12025550101',
    service: 'https://identity.example.test',
    testOnly: false,
    verifiedAt: Date.now(),
  };
  await assert.rejects(
    () => engine.completePhoneEnrollment(receipt, 'f'.repeat(64)),
    /IDENTITY_CHANGED/,
  );
  assert.equal(engine.currentEnrollment(), null);
  await engine.completePhoneEnrollment(receipt, engine.currentIdentity()!.key);
  const restarted = new DeviceMessenger(db, randomBytes, randomUUID);
  await restarted.initialize();
  assert.deepEqual(restarted.currentEnrollment(), receipt);
  const backup = await restarted.snapshot();
  assert.ok(!backup.includes('phone_enrollment') && !backup.includes(receipt.phone));
  const recovered = new DeviceMessenger(database(), randomBytes, randomUUID);
  await recovered.initialize();
  await recovered.restoreSnapshot(backup);
  assert.equal(recovered.currentEnrollment(), null);
  await engine.rememberPhone(null);
  assert.equal(engine.currentEnrollment(), null);
  assert.equal((await db.all('SELECT * FROM phone_enrollment')).length, 0);
  await engine.close();
  await recovered.close();
});

test('optional local profile details round-trip without changing keys, history or registration', async () => {
  const { a, b, chat } = await pair();
  await a.send(chat, 'Development profile migration history');
  const key = a.currentIdentity()?.key;
  const profile = {
    ...emptyProfile(),
    username: 'giorgi_qa',
    firstName: 'გიორგი',
    lastName: 'დევდარიანი',
  };
  await a.saveProfile(profile);
  assert.deepEqual(a.currentProfile(), profile);
  assert.equal(a.currentIdentity()?.name, 'გიორგი დევდარიანი');
  assert.equal(a.currentIdentity()?.key, key);
  assert.equal((await a.messages(chat)).length, 1);
  const recovered = new DeviceMessenger(database(), randomBytes, randomUUID);
  await recovered.initialize();
  await recovered.restoreSnapshot(await a.snapshot());
  assert.deepEqual(recovered.currentProfile(), profile);
  await a.saveProfile({ username: 'No_Name', firstName: '', lastName: '' });
  assert.equal(a.currentIdentity()?.name, '@no_name');
  await assert.rejects(() => a.saveProfile({ username: 'x!', firstName: '', lastName: '' }));
  assert.equal(a.currentIdentity()?.name, '@no_name');
  await a.saveProfile({ username: '', firstName: '', lastName: '' });
  assert.equal(a.currentIdentity()?.name, 'Mnelo');
  await a.close();
  await b.close();
  await recovered.close();
});

test('version 2 databases and original four-column recovery archives retain existing names and history', async () => {
  const db = database();
  const keys = createKeys(randomBytes);
  await db.exec(
    'CREATE TABLE identity(singleton INTEGER PRIMARY KEY,public_key TEXT NOT NULL UNIQUE,secret TEXT NOT NULL,name TEXT NOT NULL); PRAGMA user_version=2;',
  );
  await db.run('INSERT INTO identity VALUES(1,?,?,?)', keys.key, keys.secret, 'Existing owner');
  const engine = new DeviceMessenger(db, randomBytes, randomUUID);
  await engine.initialize();
  assert.deepEqual(engine.currentProfile(), {
    ...emptyProfile(),
    username: '',
    firstName: 'Existing owner',
    lastName: '',
  });
  const backup = JSON.parse(await engine.snapshot());
  for (const field of [
    'username',
    'first_name',
    'last_name',
    'headline',
    'about',
    'email',
    'website',
    'avatar',
  ])
    delete backup.tables.identity[0][field];
  const recovered = new DeviceMessenger(database(), randomBytes, randomUUID);
  await recovered.initialize();
  await recovered.restoreSnapshot(JSON.stringify(backup));
  assert.equal(recovered.currentIdentity()?.key, keys.key);
  assert.deepEqual(recovered.currentProfile(), engine.currentProfile());
  assert.equal(recovered.currentEnrollment(), null);
  await engine.close();
  await recovered.close();
});

test('wake permissions belong to trusted peers, survive reconnect and are revoked on block without exporting tokens', async () => {
  const { a, b, alice, bob } = await pair();
  const commands: unknown[] = [];
  const client = {
    async execute(command: unknown) {
      commands.push(command);
      return { ok: true };
    },
  } as unknown as PhoneClient;
  const wakeA = new DeviceWake(a, client),
    wakeB = new DeviceWake(b, client);
  try {
    let capA = '',
      capB = '';
    await wakeA.exchange(bob.key, (packet) => {
      capA = packet.capability;
      return true;
    });
    await wakeB.exchange(alice.key, (packet) => {
      capB = packet.capability;
      return true;
    });
    await wakeA.receive(bob.key, capB);
    await wakeB.receive(alice.key, capA);
    assert.equal(await a.peerWakeCapability(bob.key), capB);
    const event = { kind: 'message' as const, id: randomUUID() };
    await Promise.all([wakeA.wake(bob.key, event), wakeA.wake(bob.key, event)]);
    assert.equal(commands.filter((c) => (c as { action: string }).action === 'wake').length, 1);
    const archive = JSON.parse(await a.snapshot());
    assert.ok(!('wake_capabilities' in archive.tables));
    await a.block(bob.key);
    assert.equal(await a.peerWakeCapability(bob.key), null);
    assert.deepEqual(
      (await a.wakeRevocations()).map((row) => row.capability),
      [capA],
    );
    await assert.rejects(wakeA.wake(bob.key, { ...event, id: randomUUID() }), /CONTACT_BLOCKED/);
    await wakeA.reconcile();
    assert.deepEqual(await a.wakeRevocations(), []);
    await a.block(bob.key, false);
    assert.notEqual(await a.ownWakeCapability(bob.key), capA);
    await a.eraseLocalData();
    assert.equal(a.currentIdentity(), null);
  } finally {
    await a.close();
    await b.close();
  }
});
test('blocking while wake registration is pending revokes the grant before it can be shared', async () => {
  const { a, b, bob } = await pair();
  let registered!: () => void;
  let finish!: () => void;
  const started = new Promise<void>((resolve) => {
    registered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const commands: { action: string; capability?: string }[] = [];
  const wake = new DeviceWake(a, {
    async execute(command: import('../../src/messenger/phone-protocol').PhoneCommand) {
      commands.push(command);
      if (command.action === 'wake-grant') {
        registered();
        await pending;
      }
      return { ok: true };
    },
  } as unknown as PhoneClient);
  try {
    let shared = false;
    const exchange = wake.exchange(bob.key, () => {
      shared = true;
      return true;
    });
    await started;
    await a.block(bob.key);
    finish();
    await exchange;
    assert.equal(shared, false);
    assert.deepEqual(
      commands.map((c) => c.action),
      ['wake-grant', 'wake-revoke'],
    );
    assert.equal(commands[0]!.capability, commands[1]!.capability);
  } finally {
    await a.close();
    await b.close();
  }
});

test('editable call replies persist in the vault, reject empty/oversized input, and clear on account erasure', async () => {
  const db = database();
  const a = new DeviceMessenger(db, randomBytes, randomUUID);
  await a.initialize();
  await a.createIdentity('Reply fixture');
  const replies = ['შეხვედრაზე ვარ', 'მოგვიანებით გადმოგირეკავ', 'ახლა ვერ ვსაუბრობ'];
  try {
    await a.saveCallQuickReplies(replies);
    const reopened = new DeviceMessenger(db, randomBytes, randomUUID);
    await reopened.initialize();
    assert.deepEqual(await reopened.callQuickReplies(), replies);
    await assert.rejects(a.saveCallQuickReplies(['', 'valid', 'valid']));
    await assert.rejects(a.saveCallQuickReplies(['x'.repeat(241), 'valid', 'valid']));
    assert.deepEqual(await a.callQuickReplies(), replies);
    await a.eraseLocalData();
    await a.createIdentity('New fixture');
    assert.deepEqual(await a.callQuickReplies(), []);
  } finally {
    await a.close();
  }
});
