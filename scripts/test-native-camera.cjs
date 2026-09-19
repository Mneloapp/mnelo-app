/* global __dirname */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
if (process.platform !== 'darwin') throw new Error('This Objective-C probe requires macOS/Xcode.');
const root = resolve(__dirname, '..');
execFileSync(process.execPath, [join(root, 'scripts/patch-native-webrtc.cjs')], {
  stdio: 'inherit',
});
const source = readFileSync(
  join(root, 'node_modules/@livekit/react-native-webrtc/ios/RCTWebRTC/VideoCaptureController.m'),
  'utf8',
);
const method = source.slice(
  source.indexOf('- (void)applyConstraints:'),
  source.indexOf('- (NSDictionary *)getSettings'),
);
if (!method.includes('requestedDevice') || !source.includes('@"frameRate" : @(self.frameRate)'))
  throw new Error('Patched camera method/settings missing.');
const scratch = mkdtempSync(join(tmpdir(), 'mnelo-camera-probe-'));
try {
  writeFileSync(join(scratch, 'CameraConstraints.inc'), method);
  const binary = join(scratch, 'camera-probe');
  execFileSync(
    'xcrun',
    [
      'clang',
      '-fobjc-arc',
      '-Wall',
      '-Werror',
      '-framework',
      'Foundation',
      '-I',
      scratch,
      join(root, 'tests/native/camera.m'),
      '-o',
      binary,
    ],
    { stdio: 'inherit' },
  );
  execFileSync(binary, [], { stdio: 'inherit' });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
