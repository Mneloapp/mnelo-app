/* global __dirname */
// Exercise Apple's real Intents classes and typecheck the actual iPhone handler.
// The runtime stub prevents any access to accounts, devices, files or networks.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'mnelo-message-intent-'));
try {
  const stub = join(scratch, 'ShareRuntime.swift');
  writeFileSync(
    stub,
    `import Foundation
struct ShareAttachment {}
final class ShareRuntime {
  func open(items: [ShareAttachment], bundle: String, operation: String, argument: String, databaseBusyTimeout: Int32, completion: @escaping (Result<Any, Error>) -> Void) { fatalError("Probe must inject its runtime") }
  func close(completion: (() -> Void)? = nil) { completion?() }
}
`,
  );
  const source = 'modules/mnelo-share-runtime/ios/MneloMessageIntentHandler.swift';
  const selector = 'modules/mnelo-calls/ios/MneloCallReplySelector.swift';
  const binary = join(scratch, 'probe');
  execFileSync(
    'xcrun',
    ['swiftc', source, selector, stub, 'tests/native/message-intent.swift', '-o', binary],
    { cwd: root, stdio: 'inherit' },
  );
  execFileSync(binary, [], { cwd: root, stdio: 'inherit' });
  const sdk = execFileSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path'], {
    encoding: 'utf8',
  }).trim();
  execFileSync(
    'xcrun',
    ['swiftc', '-typecheck', '-target', 'arm64-apple-ios16.4', '-sdk', sdk, source, selector, stub],
    { cwd: root, stdio: 'inherit' },
  );
  console.log(
    'PASS native message handler: actual iOS SDK typecheck; device CallKit visibility remains untested',
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
