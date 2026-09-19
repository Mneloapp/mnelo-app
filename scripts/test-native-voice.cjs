/* global __dirname */
// Run actual Swift voice-routing lease against deterministic UIKit/AVFoundation
// doubles, then typecheck it against the real iPhone SDK. No hardware recording.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const root = resolve(__dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'mnelo-voice-probe-'));
const run = (args) => execFileSync('xcrun', args, { cwd: root, stdio: 'inherit' });
try {
  for (const name of ['UIKit', 'AVFoundation'])
    run([
      'swiftc',
      '-emit-module',
      '-emit-library',
      '-module-name',
      name,
      `tests/native/voice/${name}.swift`,
      '-o',
      join(scratch, `lib${name}.dylib`),
      '-emit-module-path',
      join(scratch, `${name}.swiftmodule`),
    ]);
  const source = 'modules/mnelo-calls/ios/MneloVoicePlayback.swift';
  const binary = join(scratch, 'voice-probe');
  run([
    'swiftc',
    '-I',
    scratch,
    '-L',
    scratch,
    '-lUIKit',
    '-lAVFoundation',
    '-Xlinker',
    '-rpath',
    '-Xlinker',
    scratch,
    source,
    'tests/native/voice/probe.swift',
    '-o',
    binary,
  ]);
  execFileSync(binary, [], { cwd: root, stdio: 'inherit' });
  const sdk = execFileSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path'], {
    encoding: 'utf8',
  }).trim();
  run(['swiftc', '-typecheck', '-target', 'arm64-apple-ios16.4', '-sdk', sdk, source]);
  console.log('PASS: voice lease typecheck against real iPhone SDK');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
