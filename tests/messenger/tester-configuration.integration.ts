import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { prepareTesterConfiguration } from '../../identity/tester-configuration';

const key = new Uint8Array(32).fill(7);
const previous = 'ab'.repeat(32);
const fixture =
  [
    'INFOBIP_BASE_URL="https://fixture.api.infobip.com"',
    'INFOBIP_API_KEY="fixture-not-a-credential"',
    'INFOBIP_2FA_APPLICATION_ID="fixture-app"',
    'INFOBIP_2FA_MESSAGE_ID="fixture-template"',
    'MNELO_HOSTED_IDENTITY="development"',
    `MNELO_ALLOWED_PHONE_INDICES="${previous}"`,
  ].join('\n') + '\n';
const phones = ['+12025550101', '+12025550102']; // Reserved fictional numbers only.

test('tester replacement preserves all private settings and uses the existing registry index key', () => {
  const update = prepareTesterConfiguration(fixture, key, phones);
  assert.equal(update.count, 2);
  assert.equal(update.changed, true);
  assert.deepEqual(update.config.split('\n').slice(0, 5), fixture.split('\n').slice(0, 5));
  for (const phone of phones) {
    assert.equal(update.config.includes(phone), false);
    assert.ok(
      update.config.includes(
        createHmac('sha256', key)
          .update('mnelo-phone-index-v1:' + phone)
          .digest('hex'),
      ),
    );
  }
  assert.equal(update.config.includes(previous), false);
  assert.equal(prepareTesterConfiguration(update.config, key, phones).changed, false);
});

test('tester update rejects production, duplicate/unknown fields and ambiguous environment syntax', () => {
  for (const invalid of [
    fixture.replace('"development"', '"production"'),
    fixture.replace('"development"', '"local"'),
    fixture + 'MNELO_HOSTED_IDENTITY="development"\n',
    fixture + 'UNEXPECTED_SETTING="yes"\n',
    fixture.replace('INFOBIP_API_KEY="fixture-not-a-credential"\n', ''),
    fixture.replace('"development"', 'development'),
    fixture.replace('"fixture-template"', '"fixture-template" trailing'),
    fixture.slice(0, -1),
  ])
    assert.throws(
      () => prepareTesterConfiguration(invalid, key, phones),
      /HOSTED_TESTER_CONFIGURATION_INVALID/,
    );
});

test('tester update rejects malformed or oversized input without echoing phone values', () => {
  for (const input of [
    [],
    null,
    {},
    'not-an-array',
    [phones[0], phones[0]],
    ['+12025550101\n'],
    ['2025550101'],
    ['+999123456789'],
    ['+1 (202) 555-0101'],
    Array.from({ length: 51 }, (_, i) => '+1202555' + String(100 + i).padStart(4, '0')),
  ])
    assert.throws(() => prepareTesterConfiguration(fixture, key, input), {
      message: 'HOSTED_TESTER_CONFIGURATION_INVALID',
    });
  assert.throws(() => prepareTesterConfiguration(fixture, new Uint8Array(31), phones));
});

test('tester update fails closed on invalid existing admission instead of silently resetting it', () => {
  for (const invalid of ['', 'not-an-index', previous + ',' + previous])
    assert.throws(
      () => prepareTesterConfiguration(fixture.replace(previous, invalid), key, phones),
      /HOSTED_TESTER_CONFIGURATION_INVALID/,
    );
});
