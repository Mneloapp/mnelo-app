const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

function buildShareExtension(root, destination, entry = 'entry.ts') {
  const runtime = path.join(root, 'modules/mnelo-share-runtime');
  const result = esbuild.buildSync({
    entryPoints: [path.join(runtime, entry)],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'safari16.4',
    write: false,
    minify: true,
    metafile: true,
    define: {
      'process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL': JSON.stringify(
        process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL ?? '',
      ),
      'process.env.EXPO_PUBLIC_APP_ENV': JSON.stringify(process.env.EXPO_PUBLIC_APP_ENV ?? 'local'),
    },
  });
  if (
    Object.keys(result.metafile.inputs).some((file) =>
      /node_modules\/(react-native|expo)(\/|-)/.test(file),
    )
  )
    throw new Error('The share engine must not load React Native or Expo.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(
    destination,
    fs.readFileSync(path.join(runtime, 'polyfills.js'), 'utf8') + '\n' + result.outputFiles[0].text,
  );
  const generated = path.join(runtime, 'ios/Generated');
  fs.mkdirSync(generated, { recursive: true });
  for (const [source, name] of [
    ['modules/mnelo-signal/ios/MneloSignalCore.swift', 'MneloSignalCore.swift'],
    ['modules/mnelo-vault/ios/MneloSharedVault.swift', 'MneloSharedVault.swift'],
    ['node_modules/expo-sqlite/vendor/sqlcipher/sqlite3.c', 'sqlite3.c'],
    ['node_modules/expo-sqlite/vendor/sqlcipher/sqlite3.h', 'sqlite3.h'],
  ])
    fs.copyFileSync(path.join(root, source), path.join(generated, name));
}
module.exports = {
  buildShareExtension,
  buildNotificationExtension: (root, destination) =>
    buildShareExtension(root, destination, 'notification-entry.ts'),
};
if (require.main === module)
  buildShareExtension(process.cwd(), process.argv[2] ?? 'artifacts/MneloShare.js');
