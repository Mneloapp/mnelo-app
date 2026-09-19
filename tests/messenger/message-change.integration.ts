import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import { deliveryDatabase } from './delivery-fixture';
import type { Packet } from '../../src/messenger/model';

async function fixture(group = false) {
  const nodes = await Promise.all(
    ['A', 'B', 'C'].map(async (name) => {
      const storage = deliveryDatabase();
      const engine = new DeviceMessenger(storage.db, randomBytes, randomUUID);
      await engine.initialize();
      const identity = await engine.createIdentity(name);
      return { engine, storage, identity };
    }),
  );
  for (const a of nodes)
    for (const b of nodes)
      if (a !== b) await a.engine.trustContact({ key: b.identity.key, name: b.identity.name });
  const [a, b, c] = nodes as [
    (typeof nodes)[number],
    (typeof nodes)[number],
    (typeof nodes)[number],
  ];
  const chat = group
    ? await a.engine.createGroup('Fixture group', [b.identity.key, c.identity.key])
    : await a.engine.trustContact({ key: b.identity.key, name: b.identity.name });
  if (group)
    for (const target of [b, c])
      assert.equal(
        await target.engine.receive(a.identity.key, {
          type: 'group',
          id: chat,
          title: 'Fixture group',
          revision: 1,
          members: nodes.map((node) => ({ key: node.identity.key, name: node.identity.name })),
        }),
        true,
      );
  async function send(kind: 'text' | 'image' | 'file' | 'voice' | 'location' | 'contact' = 'text') {
    const media = ['image', 'file', 'voice'].includes(kind)
      ? { name: 'sample', mime: 'application/octet-stream', bytes: 'YQ==', duration: null }
      : null;
    const id = await a.engine.send(chat, 'Original', { kind, ...(media ? { media } : {}) });
    const packet: Packet = {
      type: 'message',
      id,
      chat,
      sentAt: Date.now(),
      kind,
      body: 'Original',
      replyTo: null,
      media,
    };
    return { id, packet };
  }
  async function changes() {
    return (
      await a.storage.db.all<{ peer: string; packet: string }>(
        "SELECT peer,packet FROM control_outbox WHERE json_extract(packet,'$.type')='message_change' ORDER BY rowid",
      )
    ).map((row) => ({
      peer: row.peer,
      packet: JSON.parse(row.packet) as Extract<Packet, { type: 'message_change' }>,
    }));
  }
  return {
    a,
    b,
    c,
    chat,
    nodes,
    send,
    changes,
    close: async () => {
      for (const n of nodes) await n.engine.close();
    },
  };
}
test('text revisions arrive out of order, are author-only, and never revive a deleted message', async () => {
  const f = await fixture();
  try {
    const { id, packet } = await f.send();
    await f.a.engine.editMessage(id, 'Correction one');
    await f.a.engine.editMessage(id, 'Correction two');
    const changes = await f.changes();
    for (const entry of [...changes].reverse())
      assert.equal(await f.b.engine.receive(f.a.identity.key, entry.packet), true);
    assert.equal(await f.b.engine.receive(f.a.identity.key, packet), true);
    assert.equal((await f.b.engine.messages(f.chat))[0]?.body, 'Correction two');
    assert.ok((await f.b.engine.messages(f.chat))[0]?.editedAt);
    assert.equal(await f.b.engine.receive(f.c.identity.key, changes[0]!.packet), false);
    await assert.rejects(f.b.engine.editMessage(id, 'Impersonation'), /FORBIDDEN/);
    await f.a.engine.deleteForEveryone(id);
    const deletion = (await f.changes()).at(-1)!.packet;
    await f.b.engine.receive(f.a.identity.key, deletion);
    await f.b.engine.receive(f.a.identity.key, changes[0]!.packet);
    await f.b.engine.receive(f.a.identity.key, packet);
    const result = (await f.b.engine.messages(f.chat))[0]!;
    assert.equal(result.kind, 'deleted');
    assert.equal(result.body, '');
    await assert.rejects(f.a.engine.editMessage(id, 'Revive'), /FORBIDDEN/);
  } finally {
    await f.close();
  }
});
test('every outgoing kind deletes on all original group recipients, including before its attachment arrives', async () => {
  const f = await fixture(true);
  try {
    for (const kind of ['text', 'image', 'file', 'voice', 'location', 'contact'] as const) {
      const { id, packet } = await f.send(kind);
      await f.b.engine.receive(f.a.identity.key, packet);
      await f.b.engine.react(id, '🔥');
      await f.a.engine.deleteForEveryone(id);
      const changes = (await f.changes()).filter((entry) => entry.packet.id === id);
      assert.equal(changes.length, 2);
      for (const target of [f.b, f.c]) {
        const deletion = changes.find((entry) => entry.peer === target.identity.key)!;
        assert.equal(await target.engine.receive(f.a.identity.key, deletion.packet), true);
        assert.equal(await target.engine.hasReceivedMessage(f.a.identity.key, id), true);
        assert.equal(await target.engine.receive(f.a.identity.key, packet), true);
        const result = (await target.engine.messages(f.chat)).find((row) => row.id === id)!;
        assert.equal(result.kind, 'deleted');
        assert.equal(result.attachment, null);
        assert.equal(await target.engine.media(id), null);
        assert.deepEqual(await target.engine.reactions(id), []);
      }
    }
  } finally {
    await f.close();
  }
});
test('clearing a conversation is local, but does not cancel a previously requested remote deletion', async () => {
  const f = await fixture();
  try {
    const { id, packet } = await f.send();
    await f.b.engine.receive(f.a.identity.key, packet);
    await f.a.engine.clearLocalHistory(f.chat);
    assert.equal((await f.a.engine.messages(f.chat)).length, 0);
    assert.equal((await f.b.engine.messages(f.chat))[0]?.body, 'Original');
    assert.equal((await f.changes()).length, 0);
    const second = await f.send();
    await f.b.engine.receive(f.a.identity.key, second.packet);
    await f.a.engine.deleteForEveryone(second.id);
    await f.a.engine.clearLocalHistory(f.chat);
    assert.equal((await f.changes()).length, 1);
    await f.b.engine.receive(f.a.identity.key, (await f.changes())[0]!.packet);
    assert.equal((await f.b.engine.messages(f.chat))[0]?.kind, 'deleted');
    assert.equal(
      await f.a.engine.receive(f.b.identity.key, {
        type: 'reaction',
        id,
        emoji: '🔥',
        active: true,
      }),
      false,
    );
  } finally {
    await f.close();
  }
});
test('custom reactions are remembered across reads, bounded, and selected first without duplicates', async () => {
  const f = await fixture();
  try {
    const { id } = await f.send();
    await f.a.engine.react(id, '🦋');
    await f.a.engine.react(id, '😎');
    let choices = await f.a.engine.quickReactionChoices();
    assert.deepEqual(choices.slice(0, 2), ['😎', '🦋']);
    assert.equal(new Set(choices).size, choices.length);
    await f.a.engine.react(id, '🦋');
    await f.a.engine.react(id, '🦋');
    choices = await f.a.engine.quickReactionChoices();
    assert.equal(choices[0], '🦋');
    assert.ok(choices.length <= 12);
  } finally {
    await f.close();
  }
});

test('one reaction per person replaces/toggles in direct and group chats and survives replay', async () => {
  for (const group of [false, true]) {
    const f = await fixture(group);
    try {
      const { id, packet } = await f.send();
      await f.b.engine.receive(f.a.identity.key, packet);
      if (group) await f.c.engine.receive(f.a.identity.key, packet);
      for (const emoji of ['❤️', '👍', '😂']) {
        await f.a.engine.react(id, emoji);
        assert.deepEqual(
          (await f.a.engine.reactions(id)).map((row) => row.emoji),
          [emoji],
        );
      }
      const controls = (
        await f.a.storage.db.all<{ packet: string; peer: string }>(
          "SELECT packet,peer FROM control_outbox WHERE json_extract(packet,'$.type')='reaction' ORDER BY rowid",
        )
      )
        .filter((row) => row.peer === f.b.identity.key)
        .map((row) => JSON.parse(row.packet) as Packet);
      for (const packet of [...controls].reverse())
        await f.b.engine.receive(f.a.identity.key, packet);
      for (const packet of controls) await f.b.engine.receive(f.a.identity.key, packet);
      assert.deepEqual(
        (await f.b.engine.reactions(id)).map((row) => row.emoji),
        ['😂'],
      );
      await f.b.engine.react(id, '🔥');
      assert.equal((await f.b.engine.reactions(id)).length, 2); // one from each person
      await f.b.engine.react(id, '👏');
      assert.deepEqual(
        (await f.b.engine.reactions(id)).map((row) => row.emoji).sort(),
        ['👏', '😂'].sort(),
      );
      await f.b.engine.react(id, '👏');
      assert.deepEqual(
        (await f.b.engine.reactions(id)).map((row) => row.emoji),
        ['😂'],
      );
      if (group) {
        await f.b.engine.receive(f.c.identity.key, {
          type: 'reaction',
          id,
          emoji: '💚',
          active: true,
          revision: 1,
        });
        assert.deepEqual(
          new Set((await f.b.engine.reactions(id)).map((row) => row.peer)),
          new Set([f.a.identity.key, f.c.identity.key]),
        );
      }
    } finally {
      await f.close();
    }
  }
});

test('legacy multiple reactions show one latest choice and the next local change clears the old choices', async () => {
  const f = await fixture();
  try {
    const { id } = await f.send();
    for (const emoji of ['❤️', '👍', '😂'])
      await f.a.storage.db.run('INSERT INTO reactions VALUES(?,?,?)', id, f.a.identity.key, emoji);
    assert.deepEqual(
      (await f.a.engine.reactions(id)).map((row) => row.emoji),
      ['😂'],
    );
    await f.a.engine.react(id, '👍');
    assert.deepEqual(
      (await f.a.engine.reactions(id)).map((row) => row.emoji),
      ['👍'],
    );
    assert.equal(
      (await f.a.storage.db.all('SELECT emoji FROM reactions WHERE message_id=?', id)).length,
      1,
    );
  } finally {
    await f.close();
  }
});
