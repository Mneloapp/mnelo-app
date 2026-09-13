const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const { mkdir, writeFile, rm } = require('node:fs/promises');
const { join } = require('node:path');

const resource = '@xml/mnelo_local_network';
module.exports = function withLocalNetwork(config, { local = false } = {}) {
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:usesCleartextTraffic'] = 'false';
    if (local) application.$['android:networkSecurityConfig'] = resource;
    else if (application.$['android:networkSecurityConfig'] === resource)
      delete application.$['android:networkSecurityConfig'];
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const directory = join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      const file = join(directory, 'mnelo_local_network.xml');
      if (local) {
        await mkdir(directory, { recursive: true });
        await writeFile(
          file,
          '<?xml version="1.0" encoding="utf-8"?>\n' +
            '<network-security-config>\n' +
            '  <base-config cleartextTrafficPermitted="false" />\n' +
            '  <domain-config cleartextTrafficPermitted="true">\n' +
            '    <domain includeSubdomains="false">127.0.0.1</domain>\n' +
            '    <domain includeSubdomains="false">localhost</domain>\n' +
            '  </domain-config>\n' +
            '</network-security-config>\n',
        );
      } else await rm(file, { force: true });
      return mod;
    },
  ]);
};
