const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
require('tsx/cjs');
const {
  captureNativeBuildEnvironment,
  guardedBundlePhase,
  nativeXcodeEnvironment,
  validateNativeBuildEnvironment,
} = require('../config/native-build-environment.ts');

module.exports = function withNativeBuildEnvironment(config) {
  const snapshot = captureNativeBuildEnvironment(process.env);
  validateNativeBuildEnvironment(
    snapshot,
    snapshot.profile === 'testflight' || snapshot.profile === 'production',
  );
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      // All CocoaPods/Expo phases read this file, including Expo Constants.
      // It is regenerated from the selected Expo environment, never a hand-edited local file.
      const file = path.join(mod.modRequest.platformProjectRoot, '.xcode.env');
      const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      fs.writeFileSync(file, nativeXcodeEnvironment(previous, snapshot));
      return mod;
    },
  ]);
  return withXcodeProject(config, (mod) => {
    const phase = Object.values(mod.modResults.hash.project.objects.PBXShellScriptBuildPhase).find(
      (value) =>
        typeof value === 'object' &&
        String(value.name).replaceAll('"', '') === 'Bundle React Native code and images',
    );
    if (!phase) throw new Error('NATIVE_BUNDLE_PHASE_NOT_FOUND');
    phase.shellScript = JSON.stringify(guardedBundlePhase(JSON.parse(phase.shellScript), snapshot));
    return mod;
  });
};
