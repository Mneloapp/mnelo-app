import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { deliveryDatabase } from './delivery-fixture';
import { DeviceMessenger } from '../../src/messenger/engine';
import { ContactView } from '../../src/messenger/contact-view';
import { createKeys } from '../../src/messenger/crypto';
import { emptyProfile } from '../../src/messenger/local-profile';

test('phonebook names override existing aliases in search, headers, members and calls without altering stored or transmitted identity', async () => {
  const { db, sql } = deliveryDatabase();
  const engine = new DeviceMessenger(db, randomBytes, randomUUID);
  await engine.initialize();
  await engine.createIdentity('Development owner');
  const peer = createKeys(randomBytes).key;
  const other = createKeys(randomBytes).key;
  try {
    const chat = await engine.trustPhoneContact({
      key: peer,
      phone: '+12025550102',
      name: 'Old Mnelo alias',
    });
    await engine.trustContact({ key: other, name: 'Another fixture' });
    const group = await engine.createGroup('Development group', [peer, other]);
    await engine.recordCall(chat, randomUUID(), peer, 'voice', 'ended', 'outgoing');
    let releaseNames!: (names: ReadonlyMap<string, string>) => void;
    const initialNames = new Promise<ReadonlyMap<string, string>>((resolve) => {
      releaseNames = resolve;
    });
    const coldView = new ContactView(engine, () => initialNames);
    let firstQueryFinished = false;
    const firstQuery = coldView.chatPage('direct', 'მეგობარი').then((page) => {
      firstQueryFinished = true;
      return page;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      firstQueryFinished,
      false,
      'cold-start names must resolve before projecting a chat page',
    );
    releaseNames(new Map([[peer, 'ჩემი მეგობარი']]));
    assert.equal((await firstQuery).rows[0]?.title, 'ჩემი მეგობარი');
    const view = new ContactView(engine, new Map([[peer, 'ჩემი მეგობარი']]));
    assert.equal((await view.contacts()).find((c) => c.key === peer)?.name, 'ჩემი მეგობარი');
    assert.equal((await view.chat(chat))?.title, 'ჩემი მეგობარი');
    assert.equal((await view.chatPage('direct', 'მეგობარი')).rows[0]?.id, chat);
    assert.equal((await view.members(chat)).find((c) => c.key === peer)?.name, 'ჩემი მეგობარი');
    assert.equal((await view.callHistory())[0]?.name, 'ჩემი მეგობარი');
    assert.equal((await view.chat(group))?.title, 'Development group');
    assert.equal((await engine.contacts()).find((c) => c.key === peer)?.name, 'Old Mnelo alias');
    assert.equal((await engine.members(chat)).find((c) => c.key === peer)?.name, 'Old Mnelo alias');
    assert.equal(
      sql.prepare('SELECT name FROM contacts WHERE public_key=?').get(peer)?.name,
      'Old Mnelo alias',
    );
    const fallback = new ContactView(engine, new Map());
    assert.equal((await fallback.chat(chat))?.title, '+12025550102');
    await engine.receiveProfile(peer, {
      ...emptyProfile(),
      firstName: 'Registered',
      lastName: 'Name',
    });
    assert.equal((await fallback.contacts()).find((c) => c.key === peer)?.name, 'Registered Name');
    assert.equal((await fallback.chat(chat))?.title, 'Registered Name');
    assert.equal((await fallback.chatPage('direct', 'Registered')).rows[0]?.id, chat);
    assert.equal(
      (await fallback.members(chat)).find((c) => c.key === peer)?.name,
      'Registered Name',
    );
    assert.equal((await fallback.callHistory())[0]?.name, 'Registered Name');
    assert.equal((await view.chat(chat))?.title, 'ჩემი მეგობარი');
    await engine.receiveProfile(peer, { ...emptyProfile(), username: 'registered_username' });
    assert.equal((await fallback.chat(chat))?.title, '@registered_username');
    await engine.receiveProfile(peer, emptyProfile());
    assert.equal((await fallback.chat(chat))?.title, '+12025550102');
    assert.equal((await engine.contacts()).find((c) => c.key === peer)?.name, 'Old Mnelo alias');
  } finally {
    await engine.close();
  }
});

test('legacy shared contact previews and replies resolve a local phone without rewriting stored history', async () => {
  const { db, sql } = deliveryDatabase();
  const engine = new DeviceMessenger(db, randomBytes, randomUUID);
  await engine.initialize();
  await engine.createIdentity('Development owner');
  const peer = createKeys(randomBytes).key;
  const shared = createKeys(randomBytes).key;
  try {
    const chat = await engine.trustPhoneContact({
      key: peer,
      phone: '+12025550102',
      name: 'Recipient',
    });
    await engine.trustPhoneContact({ key: shared, phone: '+12025550103', name: 'Shared person' });
    const body = `Legacy name\nmnelo1:${shared}`;
    const id = await engine.send(chat, body, { kind: 'contact' });
    const view = new ContactView(engine, new Map([[shared, 'Saved contact']]));
    assert.equal(
      (await view.chatPage()).rows.find((row) => row.id === chat)?.preview,
      'Saved contact\n+12025550103',
    );
    assert.equal((await view.replyPreview(chat, id))?.body, 'Saved contact\n+12025550103');
    assert.equal(sql.prepare('SELECT body FROM messages WHERE id=?').get(id)?.body, body);
    assert.equal(
      (await engine.contacts()).find((contact) => contact.key === shared)?.name,
      'Shared person',
    );
    const unknownBody = `Unknown person\nmnelo1:${'f'.repeat(64)}`;
    const unknown = await engine.send(chat, unknownBody, { kind: 'contact' });
    assert.equal(
      (await view.chatPage()).rows.find((row) => row.id === chat)?.preview,
      'Unknown person',
    );
    assert.equal((await view.replyPreview(chat, unknown))?.body, 'Unknown person');
  } finally {
    await engine.close();
  }
});
