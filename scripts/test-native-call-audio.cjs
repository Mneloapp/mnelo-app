/* global __dirname */
// Execute the installed patch's actual delegate methods against deterministic
// session/ADM doubles. The signed archive separately compiles the full module
// against the real iPhone SDK. Neither check proves physical audibility.
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..');
const source = readFileSync(
  join(root, 'node_modules/@livekit/react-native-webrtc/ios/RCTWebRTC/WebRTCModule.m'),
  'utf8',
);
const methods = source.match(
  /\/\/ BEGIN MNELO CALLKIT AUDIO\n([\s\S]*?)\/\/ END MNELO CALLKIT AUDIO/,
)?.[1];
if (
  !methods ||
  !source.includes('[session addDelegate:self]') ||
  !source.includes('[_audioDeviceModule setEngineAvailability:unavailable]') ||
  !source.includes('removeDelegate:self')
)
  throw Error('Native CallKit audio patch is missing or incomplete');
const scratch = mkdtempSync(join(tmpdir(), 'mnelo-call-audio-'));
try {
  const file = join(scratch, 'probe.m'),
    binary = join(scratch, 'probe');
  writeFileSync(
    file,
    readFileSync(join(root, 'tests/native/call-audio-gate.m'), 'utf8').replace(
      '// PRODUCTION METHODS INSERTED HERE',
      methods,
    ),
  );
  execFileSync(
    'xcrun',
    ['clang', '-fobjc-arc', '-fblocks', '-Werror', '-framework', 'Foundation', file, '-o', binary],
    { cwd: root, stdio: 'inherit' },
  );
  execFileSync(binary, [], { cwd: root, stdio: 'inherit' });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
