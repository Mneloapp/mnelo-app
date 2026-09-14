const { withDangerousMod, withXcodeProject, withPodfile } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const targetName = 'MneloNotifications';
const bundleId = 'com.mnelo.messenger.notifications';
module.exports = function withNotificationPreview(config) {
  config = withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes("target 'MneloNotifications'"))
      mod.modResults.contents +=
        "\ntarget 'MneloNotifications' do\n  use_frameworks! :linkage => :static\n  pod 'MneloShareRuntime', :path => '../modules/mnelo-share-runtime/ios'\nend\n";
    return mod;
  });
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, targetName);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'NotificationService.swift'),
        'import MneloShareRuntime\nclass NotificationService: MneloNotificationService {}\n',
      );
      require('../scripts/build-share-extension.cjs').buildNotificationExtension(
        mod.modRequest.projectRoot,
        path.join(directory, 'MneloNotification.js'),
      );
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
          MneloKeychainAccessGroup: '$(AppIdentifierPrefix)com.mnelo.messenger.shared',
          MneloDeliveryOrigin: process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL ?? '',
          NSContactsUsageDescription:
            'Mnelo uses your contacts to show the names you saved on this phone.',
          NSExtension: {
            NSExtensionPointIdentifier: 'com.apple.usernotifications.service',
            NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).NotificationService',
          },
        }),
      );
      fs.writeFileSync(
        path.join(directory, targetName + '.entitlements'),
        plist.build({
          'com.apple.security.application-groups': ['group.com.mnelo.messenger.sharing'],
          'keychain-access-groups': ['$(AppIdentifierPrefix)com.mnelo.messenger.shared'],
        }),
      );
      fs.writeFileSync(
        path.join(directory, 'PrivacyInfo.xcprivacy'),
        plist.build({
          NSPrivacyTracking: false,
          NSPrivacyCollectedDataTypes: [],
          NSPrivacyAccessedAPITypes: [
            {
              NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
              NSPrivacyAccessedAPITypeReasons: ['1C8F.1'],
            },
            {
              NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
              NSPrivacyAccessedAPITypeReasons: ['C617.1'],
            },
            {
              NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
              NSPrivacyAccessedAPITypeReasons: ['E174.1'],
            },
          ],
        }),
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
      project.addBuildPhase(
        ['NotificationService.swift'],
        'PBXSourcesBuildPhase',
        'Sources',
        target.uuid,
      );
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
      project.addBuildPhase(
        ['MneloNotification.js', 'PrivacyInfo.xcprivacy'],
        'PBXResourcesBuildPhase',
        'Resources',
        target.uuid,
      );
      const group = project.addPbxGroup(
        ['NotificationService.swift', 'MneloNotification.js', 'PrivacyInfo.xcprivacy'],
        targetName,
        targetName,
      );
      project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
      entry = [target.uuid, target.pbxNativeTarget];
    }
    const main = project.getFirstTarget(),
      dependencies = project.hash.project.objects.PBXTargetDependency;
    if (!main.firstTarget.dependencies.some((ref) => dependencies[ref.value]?.target === entry[0]))
      project.addTargetDependency(main.uuid, [entry[0]]);
    for (const [key, file] of Object.entries(project.pbxBuildFileSection()))
      if (!key.endsWith('_comment') && file.fileRef === entry[1].productReference)
        file.settings = { ATTRIBUTES: ['RemoveHeadersOnCopy'] };
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
