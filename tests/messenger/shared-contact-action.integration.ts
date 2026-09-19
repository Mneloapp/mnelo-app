import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import { createKeys } from '../../src/messenger/crypto';
import { deliveryDatabase } from './delivery-fixture';
import { resolveSharedContact } from '../../src/messenger/shared-contact-action';
import { encodeSharedContact } from '../../src/messenger/contact-share';
import type { PhoneClient } from '../../src/messenger/phone-client';

const phone = '+12025550123';
async function fixture() {
  const storage = deliveryDatabase();
  const engine = new DeviceMessenger(storage.db, randomBytes, randomUUID);
  await engine.initialize();
  const own = await engine.createIdentity('Fixture');
  const peer = createKeys(randomBytes);
  const body = encodeSharedContact({ name: 'Shared person', phone });
  const client = { execute: async () => ({ key: peer.key }) } as Pick<PhoneClient, 'execute'>;
  return { engine, own, peer, body, client, close: () => engine.close() };
}
test('shared phone resolves to a functional chat and preserves an existing private name', async () => {
  const f = await fixture();
  try {
    const first = await resolveSharedContact(f.engine, f.client, f.body, () => true);
    assert.equal((await f.engine.chat(first.id))?.peer, f.peer.key);
    assert.equal((await f.engine.contacts())[0]?.phone, phone);
    const second = await resolveSharedContact(
      f.engine,
      f.client,
      encodeSharedContact({ name: 'Replacement label', phone }),
      () => true,
    );
    assert.equal(second.id, first.id);
    assert.equal(second.name, 'Shared person');
  } finally {
    await f.close();
  }
});
for (const condition of ['self', 'missing', 'mismatch', 'blocked', 'cancelled'] as const) {
  test(`shared contact refuses ${condition} without creating or replacing a chat`, async () => {
    const f = await fixture();
    try {
      if (condition === 'mismatch')
        await f.engine.trustPhoneContact({ key: createKeys(randomBytes).key, phone });
      if (condition === 'blocked') {
        await f.engine.trustPhoneContact({ key: f.peer.key, phone });
        await f.engine.block(f.peer.key, true);
      }
      const before = await f.engine.contacts();
      const client = {
        execute: async () => ({
          key: condition === 'self' ? f.own.key : condition === 'missing' ? null : f.peer.key,
        }),
      } as Pick<PhoneClient, 'execute'>;
      const code = {
        self: 'PHONE_SELF',
        missing: 'PHONE_NOT_FOUND',
        mismatch: 'PHONE_IDENTITY_CHANGED',
        blocked: 'PHONE_BLOCKED',
        cancelled: 'CONTACT_ACTION_CANCELLED',
      }[condition];
      await assert.rejects(
        resolveSharedContact(f.engine, client, f.body, () => condition !== 'cancelled'),
        new RegExp(code),
      );
      assert.deepEqual(await f.engine.contacts(), before);
    } finally {
      await f.close();
    }
  });
}
