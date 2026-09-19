/* global __dirname */
// Compile the actual owned adapter against the same vendored SQLCipher used by
// iOS. The probe controls the OS-lease boundary; it never reads a user's vault.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
if (process.platform !== 'darwin')
  throw new Error('This native SQLCipher probe requires macOS/Xcode.');
const root = resolve(__dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'mnelo-database-probe-'));
function run(args) {
  execFileSync('xcrun', args, { cwd: root, stdio: 'inherit' });
}
try {
  const object = join(scratch, 'sqlcipher.o');
  const binary = join(scratch, 'database-probe');
  const header = 'node_modules/expo-sqlite/vendor/sqlcipher/sqlite3.h';
  run([
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
  ]);
  run([
    'swiftc',
    '-import-objc-header',
    header,
    'modules/mnelo-vault/ios/MneloDatabase.swift',
    'tests/native/database.swift',
    object,
    '-o',
    binary,
    '-framework',
    'Security',
  ]);
  const schema = join(scratch, 'schema.sql');
  const sql = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import { localSchema } from './src/messenger/model.ts'; process.stdout.write(localSchema);",
    ],
    { cwd: root, encoding: 'utf8' },
  );
  writeFileSync(schema, sql);
  execFileSync(binary, [schema], { cwd: root, stdio: 'inherit' });
  const sdk = execFileSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path'], {
    encoding: 'utf8',
  }).trim();
  run([
    'swiftc',
    '-typecheck',
    '-target',
    'arm64-apple-ios16.4',
    '-sdk',
    sdk,
    '-import-objc-header',
    header,
    'modules/mnelo-vault/ios/MneloDatabase.swift',
    'modules/mnelo-vault/ios/MneloDatabaseTasks.swift',
  ]);
  console.log('PASS: actual iOS SDK typecheck for owned adapter and UIKit task implementation');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
