import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// SDK-specific support policy, not an iOS deployment-target inference.
// https://docs.expo.dev/versions/v57.0.0/#support-for-android-and-ios-versions
// Installed source and compiler evidence: docs/PHASE_0_1_REPORT.md.
const require = createRequire(import.meta.url);
const expoVersion = require('expo/package.json').version;
if (Number(expoVersion.split('.')[0]) !== 57) {
  console.error(
    'IOS_TOOLCHAIN_REAUDIT: The installed Expo SDK changed. Review its published Xcode requirement before changing this guard.',
  );
  process.exit(1);
}

try {
  const output = execFileSync('xcodebuild', ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const version = /Xcode (\d+)\.(\d+)/.exec(output);
  const major = Number(version?.[1]);
  const minor = Number(version?.[2]);
  if (!version || major < 26 || (major === 26 && minor < 4)) {
    console.error(
      `IOS_TOOLCHAIN_UNSUPPORTED: Installed expo ${expoVersion} uses SDK 57, whose published minimum is Xcode 26.4. Detected Xcode ${major}.${minor}. See docs/PHASE_0_1_REPORT.md.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`iOS toolchain requirement passed (Xcode ${major}.${minor}).`);
  }
} catch {
  console.error(
    'IOS_TOOLCHAIN_MISSING: Install Xcode 26.4 or newer and finish its first-launch setup. See README.md.',
  );
  process.exitCode = 1;
}
