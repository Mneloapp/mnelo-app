const { withAndroidManifest } = require('expo/config-plugins');

// Older generated projects explicitly removed WRITE_CONTACTS. Expo's regular
// prebuild adds permissions but leaves that old manifest-merger marker intact.
module.exports = function withContactPermissions(config) {
  return withAndroidManifest(config, (mod) => {
    const blocked = mod.android?.blockedPermissions ?? [];
    if (blocked.includes('WRITE_CONTACTS') || blocked.includes('android.permission.WRITE_CONTACTS'))
      return mod;
    for (const permission of mod.modResults.manifest['uses-permission'] ?? []) {
      if (permission.$['android:name'] === 'android.permission.WRITE_CONTACTS') {
        if (permission.$['tools:node'] === 'remove') delete permission.$['tools:node'];
      }
    }
    return mod;
  });
};
