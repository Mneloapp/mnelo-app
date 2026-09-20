/* global __dirname */
// Native iOS camera selection and CallKit AudioEngine integration fixes.
// Refuse unknown versions/source; a dependency update requires a fresh review.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dependency = path.join(root, 'node_modules/@livekit/react-native-webrtc');
const version = JSON.parse(fs.readFileSync(path.join(dependency, 'package.json'), 'utf8')).version;
if (version !== '144.1.2')
  throw new Error('Review the native camera patch before changing WebRTC.');
const target = path.join(dependency, 'ios/RCTWebRTC/VideoCaptureController.m');
const digest = () => createHash('sha256').update(fs.readFileSync(target)).digest('hex');
const original = 'cb49ad125a2f5ee8b0a106f0f698e8d05a97db92d04057cb8cb6656ad2cf632a';
const patched = '33135bb1192398312f1e12605af03159fbb49c0b62f3b52cf078bc5875475e98';
if (digest() !== patched) {
  if (digest() !== original)
    throw new Error('Unexpected native camera source; patch was not applied.');
  execFileSync(
    'patch',
    [
      '--batch',
      '--forward',
      target,
      path.join(root, 'patches/livekit-webrtc-144.1.2-camera.patch'),
    ],
    { stdio: 'pipe' },
  );
  if (digest() !== patched) throw new Error('Native camera patch integrity check failed.');
}
console.log('Verified WebRTC 144.1.2 native camera patch.');
const audioTarget = path.join(dependency, 'ios/RCTWebRTC/WebRTCModule.m');
const audioDigest = () => createHash('sha256').update(fs.readFileSync(audioTarget)).digest('hex');
const audioOriginal = '2d3a38aef55fddbaa6dfd31d3d1f37aea872508f059eac0dbdec65305053f89a';
const audioPatched = 'c91ad663a93a078a00a529d755b0a45c9afb6216fcdadaf6b98024f202d3f3e5';
if (audioDigest() !== audioPatched) {
  if (audioDigest() !== audioOriginal) throw new Error('Unexpected native audio source.');
  execFileSync(
    'patch',
    [
      '--batch',
      '--forward',
      audioTarget,
      path.join(root, 'patches/livekit-webrtc-144.1.2-callkit-audio.patch'),
    ],
    { stdio: 'pipe' },
  );
  if (audioDigest() !== audioPatched) throw new Error('Native audio patch integrity check failed.');
}
console.log('Verified WebRTC 144.1.2 native CallKit audio patch.');
