import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPushCredential } from '../../notifications/credential';

for (const mode of [0o600, 0o400]) {
  test(`owner-only provider file ${mode.toString(8)} remains readable`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'mnelo-credential-test-'));
    try {
      const file = join(directory, 'fixture');
      writeFileSync(file, 'fictional test value', { mode });
      assert.equal(readPushCredential(file), 'fictional test value');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
test('group/world access outside the systemd credential mount is rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-credential-test-'));
  try {
    const file = join(directory, 'fixture');
    writeFileSync(file, 'fictional test value', { mode: 0o600 });
    for (const mode of [0o440, 0o640, 0o644, 0o666]) {
      chmodSync(file, mode);
      assert.throws(() => readPushCredential(file), /PUSH_CONFIGURATION_INVALID/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('provider credential symlinks are rejected even when their target is private', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-credential-test-'));
  try {
    const file = join(directory, 'fixture');
    writeFileSync(file, 'fictional test value', { mode: 0o600 });
    const link = join(directory, 'link');
    symlinkSync(file, link);
    assert.throws(() => readPushCredential(link));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
