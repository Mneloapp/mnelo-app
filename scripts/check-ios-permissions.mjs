import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Check the generated or final archived .app, not just the Expo source config.
// ITMS-90683 rejected build 3 despite successful local archive/export/upload.
const app = resolve(process.argv[2] ?? 'ios/Mnelo');
const localeRoot = process.argv[2] ? app : resolve(app, 'Supporting');
const keys = [
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSContactsUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSMotionUsageDescription',
];
function plist(path) {
  return JSON.parse(
    execFileSync('plutil', ['-convert', 'json', '-o', '-', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}
const info = plist(resolve(app, 'Info.plist'));
for (const key of keys) {
  assert.ok(typeof info[key] === 'string' && info[key].trim(), `IOS_PURPOSE_MISSING: ${key}`);
}
for (const locale of ['en', 'ka']) {
  const expected = JSON.parse(readFileSync(`src/i18n/native/${locale}.json`, 'utf8')).ios;
  const localized = plist(resolve(localeRoot, `${locale}.lproj/InfoPlist.strings`));
  for (const key of keys) {
    assert.ok(
      typeof expected[key] === 'string' && expected[key].trim(),
      `IOS_TRANSLATION_MISSING: ${locale}/${key}`,
    );
    assert.equal(
      localized[key],
      expected[key],
      `IOS_PURPOSE_TRANSLATION_MISMATCH: ${locale}/${key}`,
    );
  }
}
assert.equal(
  info.NSMotionUsageDescription,
  JSON.parse(readFileSync('src/i18n/native/en.json', 'utf8')).ios.NSMotionUsageDescription,
);
assert.equal(info.NSLocationAlwaysUsageDescription, undefined, 'IOS_ALWAYS_LOCATION_UNEXPECTED');
assert.equal(
  info.NSLocationAlwaysAndWhenInUseUsageDescription,
  undefined,
  'IOS_ALWAYS_LOCATION_UNEXPECTED',
);
assert.ok(
  !(info.UIBackgroundModes ?? []).includes('location'),
  'IOS_BACKGROUND_LOCATION_UNEXPECTED',
);
if (process.argv[2]) {
  // The camera itself contains the provider's name as a lookup string even
  // when the class is absent. Require its defined Objective-C class symbol.
  const symbols = execFileSync('xcrun', ['nm', '-U', resolve(app, info.CFBundleExecutable)], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.ok(
    symbols.includes('_OBJC_CLASS_$_ExpoCameraZXingProvider'),
    'IOS_QR_PROVIDER_MISSING: camera preview alone cannot decode contact QR codes',
  );
}
console.log(
  'iOS purpose strings: 6 keys and EN/KA translations PASS; no always/background location; archived apps include the QR provider. This does not prove Apple processing or physical scanning/permission QA.',
);
