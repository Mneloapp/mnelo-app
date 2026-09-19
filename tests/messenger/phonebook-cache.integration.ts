import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deliveryDatabase } from './delivery-fixture';
import { DeviceMessenger } from '../../src/messenger/engine';
import { createKeys } from '../../src/messenger/crypto';
import { phonebookBindings, type PhonebookCacheScope } from '../../src/messenger/phonebook-cache';

const ownPhone = '+12025550101';
const peerPhone = '+12025550102';
const receipt = (phone = ownPhone) => ({
  phone,
  service: 'https://identity.example.test',
  testOnly: false,
  verifiedAt: Date.now(),
});
async function fixture(path?: string) {
  const { db, sql } = deliveryDatabase(path);
  const engine = new DeviceMessenger(db, randomBytes, randomUUID);
  await engine.initialize();
  const owner = await engine.createIdentity('Cache fixture');
  await engine.completePhoneEnrollment(receipt(), owner.key);
  const peer = createKeys(randomBytes).key;
  await engine.trustPhoneContact({ key: peer, phone: peerPhone, name: 'Persistent Mnelo alias' });
  const scope: PhonebookCacheScope = {
    owner: owner.key,
    phone: ownPhone,
    bindings: phonebookBindings(await engine.contacts()),
  };
  return { db, sql, engine, peer, scope };
}

test('matched alias snapshot survives a vault reopen, stays out of history exports and leaves identity untouched', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-phonebook-cache-'));
  const path = join(directory, 'history.db');
  const first = await fixture(path);
  let reopened: DeviceMessenger | undefined;
  try {
    await first.engine.replacePhonebookNames(
      first.scope,
      new Map([[first.peer, 'Private phonebook alias']]),
      () => true,
    );
    const backup = await first.engine.snapshot();
    assert.ok(
      !backup.includes('phonebook_name_cache') && !backup.includes('Private phonebook alias'),
    );
    assert.equal((await first.engine.contacts())[0]?.name, 'Persistent Mnelo alias');
    await first.engine.close();
    reopened = new DeviceMessenger(deliveryDatabase(path).db, randomBytes, randomUUID);
    await reopened.initialize();
    assert.equal(
      (await reopened.cachedPhonebookNames(first.scope))?.get(first.peer),
      'Private phonebook alias',
    );
    await reopened.replacePhonebookNames(first.scope, new Map(), () => true);
    assert.deepEqual(
      [...(await reopened.cachedPhonebookNames(first.scope))!],
      [],
      'fresh missing matches replace old aliases',
    );
    assert.equal((await reopened.contacts())[0]?.name, 'Persistent Mnelo alias');
  } finally {
    await (reopened ?? first.engine).close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('owner, registered phone and exact peer-number binding must match; block and account change clear the cache', async () => {
  const { engine, sql, peer, scope } = await fixture();
  try {
    await engine.replacePhonebookNames(scope, new Map([[peer, 'My contact']]), () => true);
    assert.equal(
      await engine.cachedPhonebookNames({ ...scope, owner: createKeys(randomBytes).key }),
      null,
    );
    assert.equal(await engine.cachedPhonebookNames({ ...scope, phone: '+12025550103' }), null);
    sql.prepare('UPDATE contact_numbers SET phone=? WHERE public_key=?').run('+12025550104', peer);
    assert.equal(await engine.cachedPhonebookNames(scope), null);
    await engine.replacePhonebookNames(scope, new Map([[peer, 'Obsolete binding']]), () => true);
    assert.ok(
      !String(sql.prepare('SELECT aliases FROM phonebook_name_cache').get()?.aliases).includes(
        'Obsolete',
      ),
    );
    sql.prepare('UPDATE contact_numbers SET phone=? WHERE public_key=?').run(peerPhone, peer);
    await engine.block(peer);
    assert.equal(sql.prepare('SELECT count(*) AS count FROM phonebook_name_cache').get()?.count, 0);
    await engine.block(peer, false);
    await engine.replacePhonebookNames(scope, new Map([[peer, 'My contact']]), () => true);
    await engine.completePhoneEnrollment(receipt('+12025550103'), scope.owner);
    assert.equal(sql.prepare('SELECT count(*) AS count FROM phonebook_name_cache').get()?.count, 0);
    assert.equal(await engine.cachedPhonebookNames(scope), null);
  } finally {
    await engine.close();
  }
});

test('expired asynchronous writes cannot resurrect a revoked snapshot while waiting for a transaction', async () => {
  const { engine, peer, scope } = await fixture();
  try {
    await engine.replacePhonebookNames(scope, new Map([[peer, 'Before revoke']]), () => true);
    let release!: () => void;
    let began!: () => void;
    const entered = new Promise<void>((resolve) => {
      began = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocking = engine.deliveryAtomic(async () => {
      began();
      await gate;
    });
    await entered;
    let current = true;
    const staleWrite = engine.replacePhonebookNames(
      scope,
      new Map([[peer, 'Must not return']]),
      () => current,
    );
    current = false;
    const cleared = engine.clearPhonebookNames(scope.owner);
    release();
    await Promise.all([blocking, staleWrite, cleared]);
    assert.equal(await engine.cachedPhonebookNames(scope), null);
  } finally {
    await engine.close();
  }
});

test('bounded snapshot accepts only known matched peers and rejects corrupt or oversized cached values', async () => {
  const { engine, sql, peer, scope } = await fixture();
  try {
    await assert.rejects(
      engine.replacePhonebookNames(
        scope,
        new Map([[createKeys(randomBytes).key, 'Unrelated phonebook person']]),
        () => true,
      ),
      /PHONEBOOK_CACHE_INVALID/,
    );
    await assert.rejects(
      engine.replacePhonebookNames(scope, new Map([[peer, 'x'.repeat(61)]]), () => true),
    );
    await engine.replacePhonebookNames(scope, new Map([[peer, 'Valid name']]), () => true);
    sql.prepare('UPDATE phonebook_name_cache SET aliases=?').run('broken JSON');
    assert.equal(await engine.cachedPhonebookNames(scope), null);
    sql.prepare('UPDATE phonebook_name_cache SET aliases=?').run('x'.repeat(180001));
    assert.equal(await engine.cachedPhonebookNames(scope), null);
  } finally {
    await engine.close();
  }
});

test('erase, phone reset and same-owner history restore cannot restore a transient phonebook snapshot', async () => {
  const { engine, sql, peer, scope } = await fixture();
  try {
    const backup = await engine.snapshot();
    await engine.replacePhonebookNames(scope, new Map([[peer, 'Disposable name']]), () => true);
    await engine.rememberPhone(ownPhone);
    assert.equal(sql.prepare('SELECT count(*) AS count FROM phonebook_name_cache').get()?.count, 0);
    await engine.completePhoneEnrollment(receipt(), scope.owner);
    await engine.replacePhonebookNames(scope, new Map([[peer, 'Disposable name']]), () => true);
    await engine.eraseLocalData();
    assert.equal(sql.prepare('SELECT count(*) AS count FROM phonebook_name_cache').get()?.count, 0);
    // A stale row from an interrupted older app must also be removed by restore,
    // even when the restored history has exactly the same owner and contacts.
    sql
      .prepare('INSERT INTO phonebook_name_cache VALUES(1,?,?,?,?)')
      .run(
        scope.owner,
        scope.phone,
        scope.bindings,
        JSON.stringify([[peer, 'Do not restore this']]),
      );
    await engine.restoreSnapshot(backup);
    await engine.completePhoneEnrollment(receipt(), scope.owner);
    assert.equal(await engine.cachedPhonebookNames(scope), null);
  } finally {
    await engine.close();
  }
});
