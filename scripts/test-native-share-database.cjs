/* global __dirname */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, realpathSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mnelo-share-db-probe-')));
try {
  const object = join(scratch, 'sqlcipher.o');
  execFileSync(
    'xcrun',
    [
      'clang',
      '-O0',
      '-c',
      'node_modules/expo-sqlite/vendor/sqlcipher/sqlite3.c',
      '-o',
      object,
      '-DHAVE_USLEEP=1',
      '-DSQLITE_ENABLE_LOCKING_STYLE=0',
      '-DSQLITE_TEMP_STORE=2',
      '-DSQLITE_HAS_CODEC=1',
      '-DSQLCIPHER_CRYPTO_CC',
      '-DSQLITE_EXTRA_INIT=sqlcipher_extra_init',
      '-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown',
      '-DNDEBUG',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  const binary = join(scratch, 'probe');
  execFileSync(
    'xcrun',
    [
      'swiftc',
      '-import-objc-header',
      'node_modules/expo-sqlite/vendor/sqlcipher/sqlite3.h',
      'modules/mnelo-share-runtime/ios/ShareDatabase.swift',
      'tests/native/share-database.swift',
      object,
      '-framework',
      'Security',
      '-o',
      binary,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  execFileSync(binary, [scratch], { cwd: root, stdio: 'inherit' });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
