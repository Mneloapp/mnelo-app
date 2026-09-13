import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import jpeg from 'jpeg-js';
import { DeviceMessenger } from '../../src/messenger/engine';
import { emptyProfile } from '../../src/messenger/local-profile';
import { validAvatar } from '../../src/messenger/profile-avatar';
import type { SQLValue } from '../../src/messenger/model';

async function fixture() {
  const db = new DatabaseSync(':memory:');
  const engine = new DeviceMessenger(
    {
      async exec(sql) {
        db.exec(sql);
      },
      async run(sql, ...args) {
        db.prepare(sql).run(...args);
      },
      async all<T>(sql: string, ...args: SQLValue[]) {
        return db.prepare(sql).all(...args) as T[];
      },
      async close() {
        db.close();
      },
    },
    randomBytes,
    randomUUID,
  );
  await engine.initialize();
  await engine.createIdentity('Development fixture');
  return engine;
}
const photo = Buffer.from(
  jpeg.encode({ width: 4, height: 4, data: Buffer.alloc(64, 255) }, 60).data,
).toString('base64');
test('reply previews are scoped to the current conversation and respect local deletion', async () => {
  const a = await fixture(),
    b = await fixture(),
    c = await fixture();
  try {
    const first = await a.trustContact({ key: b.currentIdentity()!.key, name: 'B' });
    const other = await a.trustContact({ key: c.currentIdentity()!.key, name: 'C' });
    const id = await a.send(first, 'Development reply fixture');
    assert.equal((await a.replyPreview(first, id))?.body, 'Development reply fixture');
    assert.equal(await a.replyPreview(other, id), null);
    await a.deleteLocalMessage(id);
    assert.equal(await a.replyPreview(first, id), null);
  } finally {
    await a.close();
    await b.close();
    await c.close();
  }
});
test('one-sided phone add becomes a local request; accept starts delivery without reverse search', async () => {
  const a = await fixture(),
    b = await fixture();
  const keyA = a.currentIdentity()!.key,
    keyB = b.currentIdentity()!.key;
  try {
    const chat = await a.trustPhoneContact({ key: keyB, phone: '+12025550102', name: 'B' });
    await a.send(chat, 'Development request fixture');
    assert.equal(await b.acceptsPeer(keyA), false);
    assert.equal(await b.receiveContactRequest(keyA, '+12025550101'), true);
    assert.equal(await b.receiveContactRequest(keyA, '+12025550101'), false);
    assert.equal((await b.contactRequests()).length, 1);
    assert.equal((await b.chats()).length, 0);
    assert.equal(await b.acceptContactRequest(keyA), chat);
    assert.equal(await b.acceptsPeer(keyA), true);
    assert.equal((await b.contactRequests()).length, 0);
    assert.equal((await b.contacts())[0]?.phone, '+12025550101');
    const queued: Promise<unknown>[] = [];
    a.attachTransport({
      stop: () => {},
      send: (peer, packet) => {
        assert.equal(peer, keyB);
        queued.push(b.receive(keyA, packet));
        return true;
      },
    });
    await a.flush();
    await Promise.all(queued);
    assert.equal((await b.messages(chat))[0]?.body, 'Development request fixture');
  } finally {
    await a.close();
    await b.close();
  }
});
test('request blocking, changed number bindings and backup boundaries remain enforced', async () => {
  const a = await fixture(),
    b = await fixture(),
    c = await fixture();
  const keyA = a.currentIdentity()!.key,
    keyC = c.currentIdentity()!.key;
  try {
    await b.receiveContactRequest(keyA, '+12025550101');
    const backup = JSON.parse(await b.snapshot());
    assert.equal(backup.tables.contact_requests, undefined);
    await b.rejectContactRequest(keyA);
    assert.equal(await b.receiveContactRequest(keyA, '+12025550101'), false);
    assert.equal(await b.acceptsPeer(keyA), false);
    await assert.rejects(() => b.acceptContactRequest(keyA));
    await b.trustPhoneContact({ key: keyC, phone: '+12025550103', name: 'C' });
    assert.equal(await b.receiveContactRequest(keyA, '+12025550103'), false);
    await assert.rejects(() => b.receiveContactRequest(keyC, 'not-a-phone'));
  } finally {
    await a.close();
    await b.close();
    await c.close();
  }
});
test('profile images are small bounded JPEGs, never remote resources or oversized decoded images', () => {
  assert.equal(validAvatar(photo), true);
  for (const invalid of [
    'https://example.com/avatar',
    'data:image/svg+xml,anything',
    Buffer.from('<svg/>').toString('base64'),
    photo.repeat(100),
  ])
    assert.equal(validAvatar(invalid), false);
  const large = Buffer.from(
    jpeg.encode({ width: 385, height: 1, data: Buffer.alloc(385 * 4, 255) }, 30).data,
  ).toString('base64');
  assert.equal(validAvatar(large), false);
});
test('only a trusted sender can update their own card; removal, backups and blocking preserve boundaries', async () => {
  const a = await fixture(),
    b = await fixture(),
    recovered = await fixture();
  const keyA = a.currentIdentity()!.key,
    keyB = b.currentIdentity()!.key;
  try {
    const profile = {
      ...emptyProfile(),
      firstName: 'ნინო',
      headline: 'Designer',
      email: 'test@example.com',
      website: 'example.com',
      avatar: photo,
    };
    assert.equal(await b.receiveProfile(keyA, profile), false);
    await b.trustContact({ key: keyA, name: 'My saved name' });
    await a.trustContact({ key: keyB, name: 'Development B' });
    await a.saveProfile(profile);
    assert.equal(await b.receiveProfile(keyA, a.currentProfile()), true);
    assert.deepEqual(await b.contactProfile(keyA), profile);
    assert.equal((await b.contacts())[0]!.name, 'My saved name');
    assert.equal(await b.contactProfile(keyB), null);
    await recovered.eraseLocalData();
    await recovered.restoreSnapshot(await b.snapshot());
    assert.deepEqual(await recovered.contactProfile(keyA), profile);
    await b.block(keyA);
    assert.equal(await b.contactProfile(keyA), null);
    assert.equal(await b.receiveProfile(keyA, emptyProfile()), false);
    await b.block(keyA, false);
    await b.receiveProfile(keyA, emptyProfile());
    assert.equal((await b.contactProfile(keyA))!.avatar, '');
    await assert.rejects(() => b.receiveProfile(keyA, { ...profile, key: keyB }));
  } finally {
    await a.close();
    await b.close();
    await recovered.close();
  }
});
test('build-five backups import with defaults and preserve keys, history and unverified restore state', async () => {
  const a = await fixture(),
    restored = await fixture();
  try {
    await a.saveProfile({ ...emptyProfile(), firstName: 'Existing owner' });
    const archive = JSON.parse(await a.snapshot());
    delete archive.tables.contact_profiles;
    for (const field of ['headline', 'about', 'email', 'website', 'avatar'])
      delete archive.tables.identity[0][field];
    await restored.eraseLocalData();
    await restored.restoreSnapshot(JSON.stringify(archive));
    assert.equal(restored.currentIdentity()!.key, a.currentIdentity()!.key);
    assert.equal(restored.currentProfile().firstName, 'Existing owner');
    assert.equal(restored.currentProfile().avatar, '');
    assert.equal(restored.currentEnrollment(), null);
    const malformed = JSON.parse(JSON.stringify(archive));
    malformed.tables.identity[0].avatar = photo;
    await restored.eraseLocalData();
    await assert.rejects(
      () => restored.restoreSnapshot(JSON.stringify(malformed)),
      /BACKUP_COLUMNS_INVALID/,
    );
  } finally {
    await a.close();
    await restored.close();
  }
});

test('phone lookup pins a local number/key, never overwrites a changed key or a block, and restores with own backup', async () => {
  const a = await fixture(),
    b = await fixture(),
    c = await fixture(),
    restored = await fixture();
  const phone = '+12025550102',
    key = b.currentIdentity()!.key;
  try {
    await a.trustPhoneContact({ key, phone });
    assert.deepEqual((await a.contacts())[0], { key, name: phone, phone, blocked: false });
    await assert.rejects(
      () => a.trustPhoneContact({ key: c.currentIdentity()!.key, phone }),
      /PHONE_IDENTITY_CHANGED/,
    );
    assert.equal((await a.contacts()).length, 1);
    await a.block(key);
    await assert.rejects(() => a.trustPhoneContact({ key, phone }), /CONTACT_BLOCKED/);
    assert.equal((await a.contacts())[0]!.blocked, true);
    await restored.eraseLocalData();
    await restored.restoreSnapshot(await a.snapshot());
    assert.deepEqual(await restored.contacts(), await a.contacts());
    await assert.rejects(
      () => restored.trustPhoneContact({ key: c.currentIdentity()!.key, phone }),
      /PHONE_IDENTITY_CHANGED/,
    );
    assert.equal(restored.currentEnrollment(), null);
  } finally {
    await Promise.all([a, b, c, restored].map((e) => e.close()));
  }
});
test('directly received profile replaces only the numeric fallback, keeping an explicitly saved name', async () => {
  const a = await fixture(),
    b = await fixture();
  const key = b.currentIdentity()!.key,
    phone = '+12025550102';
  try {
    const chat = await a.trustPhoneContact({ key, phone });
    await a.receiveProfile(key, { ...emptyProfile(), firstName: 'Shared name' });
    assert.equal((await a.contacts())[0]!.name, 'Shared name');
    assert.equal((await a.chat(chat))!.title, 'Shared name');
    await a.trustContact({ key, name: 'My saved name' });
    await a.receiveProfile(key, { ...emptyProfile(), firstName: 'Another shared name' });
    assert.equal((await a.contacts())[0]!.name, 'My saved name');
  } finally {
    await a.close();
    await b.close();
  }
});
test('build-nine backups migrate without losing identity/history or inventing phone bindings', async () => {
  const a = await fixture(),
    b = await fixture();
  try {
    const data = JSON.parse(await a.snapshot());
    delete data.tables.contact_numbers;
    await b.eraseLocalData();
    await b.restoreSnapshot(JSON.stringify(data));
    assert.equal(a.currentIdentity()!.key, b.currentIdentity()!.key);
    assert.deepEqual(JSON.parse(await b.snapshot()).tables.contact_numbers, []);
    const malicious = JSON.parse(await a.snapshot());
    await b.eraseLocalData();
    malicious.tables.contact_numbers = [
      { phone: '+abcde12345', public_key: a.currentIdentity()!.key },
    ];
    await assert.rejects(() => b.restoreSnapshot(JSON.stringify(malicious)));
    assert.equal(b.currentIdentity(), null);
  } finally {
    await a.close();
    await b.close();
  }
});
