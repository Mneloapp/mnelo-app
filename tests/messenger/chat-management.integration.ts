import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import { ContactView } from '../../src/messenger/contact-view';
import { createKeys } from '../../src/messenger/crypto';
import { createChatExport } from '../../src/messenger/chat-export';
import { emptyGroupProfile } from '../../src/messenger/group-profile';
import { deliveryDatabase } from './delivery-fixture';

async function fixture() {
  const storage = deliveryDatabase();
  const engine = new DeviceMessenger(storage.db, randomBytes, randomUUID);
  await engine.initialize();
  const own = await engine.createIdentity('Me');
  const peers = Array.from({ length: 3 }, (_, i) => ({
    key: createKeys(randomBytes).key,
    name: 'Peer ' + i,
  }));
  const direct = await engine.trustContact(peers[0]!);
  for (const peer of peers.slice(1)) await engine.trustContact(peer);
  const group = await engine.createGroup(
    'Family',
    peers.slice(0, 2).map((p) => p.key),
  );
  const view = new ContactView(engine, new Map());
  return { storage, engine, own, peers, direct, group, view };
}
test('delete removes local history/media/list entry, keeps identity and membership, rejects replay; new activity restores chat', async () => {
  const f = await fixture();
  try {
    const id = await f.engine.send(f.direct, 'photo', {
      kind: 'image',
      media: { name: 'a.jpg', mime: 'image/jpeg', bytes: 'AQID', duration: null },
    });
    await f.engine.deleteLocalChat(f.direct);
    assert.equal(
      (await f.engine.chats()).some((c) => c.id === f.direct),
      false,
    );
    assert.equal((await f.engine.contacts()).length, 3);
    assert.equal((await f.engine.members(f.direct)).length, 2);
    assert.equal((await f.engine.messages(f.direct)).length, 0);
    assert.equal(f.storage.sql.prepare('SELECT COUNT(*) AS n FROM media').get()!.n, 0);
    assert.equal(await f.engine.hasReceivedMessage(f.own.key, id), true);
    await f.engine.receive(f.peers[0]!.key, {
      type: 'message',
      id: randomUUID(),
      chat: f.direct,
      kind: 'text',
      body: 'New incoming',
      sentAt: Date.now(),
      replyTo: null,
      media: null,
    });
    assert.equal((await f.engine.chats()).find((c) => c.id === f.direct)?.preview, 'New incoming');
    await f.engine.deleteLocalChat(f.group);
    assert.equal((await f.engine.members(f.group)).length, 3);
    assert.equal((await f.engine.chat(f.group))?.left_group, 0);
    await f.engine.send(f.group, 'New outgoing');
    assert.equal(
      (await f.engine.chats()).some((c) => c.id === f.group),
      true,
    );
  } finally {
    await f.engine.close();
  }
});
test('export proof prevents deleting new or edited messages and another account; receipts do not block deletion', async () => {
  const f = await fixture();
  try {
    await f.engine.send(f.direct, 'First');
    const exportNow = () => createChatExport(f.engine, f.view, f.direct, { write: () => {} });
    const first = await exportNow();
    await f.engine.send(f.direct, 'Arrived during saving');
    await assert.rejects(f.engine.deleteLocalChat(f.direct, first.proof), /EXPORT_CHANGED/);
    const second = await exportNow();
    f.storage.sql.prepare("UPDATE messages SET body='Edited' WHERE chat_id=?").run(f.direct);
    await assert.rejects(f.engine.deleteLocalChat(f.direct, second.proof), /EXPORT_CHANGED/);
    const latest = await exportNow();
    await assert.rejects(
      f.engine.deleteLocalChat(f.direct, { ...latest.proof, owner: f.peers[0]!.key }),
      /IDENTITY_CHANGED/,
    );
    f.storage.sql.prepare('UPDATE deliveries SET acknowledged=1,read_at=99').run();
    await f.engine.deleteLocalChat(f.direct, latest.proof);
    assert.equal((await f.engine.messages(f.direct)).length, 0);
    assert.equal(
      (await f.engine.chats()).some((c) => c.id === f.direct),
      false,
    );
  } finally {
    await f.engine.close();
  }
});
test('group edits preserve fresh membership and blocked existing members; removal reaches the removed peer and unauthorized changes fail', async () => {
  const f = await fixture();
  try {
    await f.engine.changeGroupMembers(f.group, { add: [f.peers[2]!.key] });
    await f.engine.block(f.peers[0]!.key, true);
    await f.engine.editGroupProfile(f.group, 'New name', {
      ...emptyGroupProfile(),
      about: 'Description',
    });
    assert.equal((await f.engine.members(f.group)).length, 4);
    await f.engine.changeGroupMembers(f.group, { remove: f.peers[1]!.key });
    assert.equal((await f.engine.members(f.group)).length, 3);
    assert.ok(
      f.storage.sql
        .prepare('SELECT 1 FROM group_deliveries WHERE chat_id=? AND peer=?')
        .get(f.group, f.peers[1]!.key),
    );
    assert.equal((await f.engine.chat(f.group))?.title, 'New name');
    await assert.rejects(
      f.engine.changeGroupMembers(f.group, { remove: f.own.key }),
      /GROUP_INVALID/,
    );
    const unknown = createKeys(randomBytes).key;
    await assert.rejects(
      f.engine.changeGroupMembers(f.group, { add: [unknown] }),
      /CONTACT_UNTRUSTED/,
    );
    f.storage.sql.prepare('UPDATE chats SET owner=? WHERE id=?').run(f.peers[0]!.key, f.group);
    await assert.rejects(
      f.engine.changeGroupMembers(f.group, { remove: f.peers[1]!.key }),
      /GROUP_FORBIDDEN/,
    );
    await assert.rejects(
      f.engine.editGroupProfile(f.group, 'Unauthorized', emptyGroupProfile()),
      /GROUP_FORBIDDEN/,
    );
  } finally {
    await f.engine.close();
  }
});
