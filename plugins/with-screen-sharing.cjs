/* global __dirname */
const {
  withInfoPlist,
  withEntitlementsPlist,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const targetName = 'MneloBroadcast';
const bundleId = 'com.mnelo.messenger.broadcast';
const group = 'group.com.mnelo.messenger.sharing';
const swift = ['SocketConnection.swift', 'SampleUploader.swift', 'SampleHandler.swift'];
module.exports = function withScreenSharing(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.RTCAppGroupIdentifier = group;
    mod.modResults.RTCScreenSharingExtension = bundleId;
    return mod;
  });
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.security.application-groups'] = [
      ...new Set([...(mod.modResults['com.apple.security.application-groups'] ?? []), group]),
    ];
    return mod;
  });
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, targetName);
      fs.mkdirSync(directory, { recursive: true });
      for (const file of swift)
        fs.copyFileSync(path.join(__dirname, 'broadcast', file), path.join(directory, file));
      fs.writeFileSync(
        path.join(directory, 'Info.plist'),
        plist.build({
          CFBundleDevelopmentRegion: 'en',
          CFBundleDisplayName: 'Mnelo',
          CFBundleExecutable: '$(EXECUTABLE_NAME)',
          CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
          CFBundleInfoDictionaryVersion: '6.0',
          CFBundleName: '$(PRODUCT_NAME)',
          CFBundlePackageType: 'XPC!',
          CFBundleShortVersionString: mod.version,
          CFBundleVersion: mod.ios.buildNumber,
          NSExtension: {
            NSExtensionPointIdentifier: 'com.apple.broadcast-services-upload',
            NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).SampleHandler',
            RPBroadcastProcessMode: 'RPBroadcastProcessModeSampleBuffer',
          },
        }),
      );
      fs.writeFileSync(
        path.join(directory, targetName + '.entitlements'),
        plist.build({ 'com.apple.security.application-groups': [group] }),
      );
      return mod;
    },
  ]);
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    project.hash.project.objects.PBXTargetDependency ??= {};
    project.hash.project.objects.PBXContainerItemProxy ??= {};
    let entry = Object.entries(project.pbxNativeTargetSection()).find(
      ([key, value]) =>
        !key.endsWith('_comment') && String(value.name).replaceAll('"', '') === targetName,
    );
    if (!entry) {
      const target = project.addTarget(targetName, 'app_extension', targetName, bundleId);
      project.addBuildPhase(swift, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
      const folder = project.addPbxGroup(swift, targetName, targetName);
      project.addToPbxGroup(folder.uuid, project.getFirstProject().firstProject.mainGroup);
      entry = [target.uuid, target.pbxNativeTarget];
    }
    const main = project.getFirstTarget();
    const dependencies = project.hash.project.objects.PBXTargetDependency;
    if (!main.firstTarget.dependencies.some((ref) => dependencies[ref.value]?.target === entry[0]))
      project.addTargetDependency(main.uuid, [entry[0]]);
    for (const [key, file] of Object.entries(project.pbxBuildFileSection())) {
      if (!key.endsWith('_comment') && file.fileRef === entry[1].productReference)
        file.settings = { ATTRIBUTES: ['RemoveHeadersOnCopy'] };
    }
    for (const value of Object.values(project.pbxXCBuildConfigurationSection())) {
      const settings = value?.buildSettings;
      if (String(settings?.PRODUCT_BUNDLE_IDENTIFIER).replaceAll('"', '') !== bundleId) continue;
      Object.assign(settings, {
        INFOPLIST_FILE: targetName + '/Info.plist',
        CODE_SIGN_ENTITLEMENTS: targetName + '/' + targetName + '.entitlements',
        CURRENT_PROJECT_VERSION: mod.ios.buildNumber,
        MARKETING_VERSION: mod.version,
        DEVELOPMENT_TEAM: mod.ios.appleTeamId,
        CODE_SIGN_STYLE: 'Automatic',
        SWIFT_VERSION: '5.9',
        IPHONEOS_DEPLOYMENT_TARGET: '16.4',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        SKIP_INSTALL: 'YES',
        GENERATE_INFOPLIST_FILE: 'NO',
        DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"',
      });
    }
    return mod;
  });
};
