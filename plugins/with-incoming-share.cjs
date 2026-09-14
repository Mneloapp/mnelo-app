const {
  withDangerousMod,
  withXcodeProject,
  withPodfile,
  withEntitlementsPlist,
  withInfoPlist,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;

// Keep sharing inside the Photos/Files host. Reuse the application's encrypted
// device engine through a native extension, without launching the containing app.
module.exports = function withIncomingShare(config) {
  const access = '$(AppIdentifierPrefix)com.mnelo.messenger.shared';
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['keychain-access-groups'] = [
      ...new Set([
        '$(AppIdentifierPrefix)com.mnelo.messenger',
        ...(mod.modResults['keychain-access-groups'] ?? []),
        access,
      ]),
    ];
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults.MneloKeychainAccessGroup = access;
    return mod;
  });
  config = withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes("pod 'MneloShareRuntime'"))
      mod.modResults.contents +=
        "\ntarget 'expo-sharing-extension' do\n  use_frameworks! :linkage => :static\n  pod 'MneloShareRuntime', :path => '../modules/mnelo-share-runtime/ios'\nend\n";
    return mod;
  });
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, 'expo-sharing-extension');
      const source = path.join(directory, 'ShareIntoViewController.swift');
      fs.writeFileSync(
        source,
        'import MneloShareRuntime\nclass ShareIntoViewController: MneloShareController {}\n',
      );
      require('../scripts/build-share-extension.cjs').buildShareExtension(
        mod.modRequest.projectRoot,
        path.join(directory, 'MneloShare.js'),
      );
      const entitlementsPath = path.join(directory, 'expo-sharing-extension.entitlements');
      const entitlements = plist.parse(fs.readFileSync(entitlementsPath, 'utf8'));
      entitlements['keychain-access-groups'] = [
        ...new Set([...(entitlements['keychain-access-groups'] ?? []), access]),
      ];
      fs.writeFileSync(entitlementsPath, plist.build(entitlements));
      const infoPath = path.join(directory, 'Info.plist');
      const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
      info.CFBundleDisplayName = 'Mnelo';
      info.MneloKeychainAccessGroup = access;
      info.MneloDeliveryOrigin = process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL ?? '';
      info.NSContactsUsageDescription =
        'Mnelo uses your contacts to show the names you saved on this phone.';
      info.NSExtension.NSExtensionPrincipalClass = '$(PRODUCT_MODULE_NAME).ShareIntoViewController';
      info.NSExtension.NSExtensionAttributes.IntentsSupported = ['INSendMessageIntent'];
      fs.writeFileSync(infoPath, plist.build(info));
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
    // Expo only sets the target version at creation; keep existing targets in sync on prebuild.
    for (const entry of Object.values(mod.modResults.pbxXCBuildConfigurationSection())) {
      const settings = entry?.buildSettings;
      if (
        String(settings?.PRODUCT_BUNDLE_IDENTIFIER).replaceAll('"', '') !==
        'com.mnelo.messenger.share'
      )
        continue;
      settings.CURRENT_PROJECT_VERSION = mod.ios.buildNumber;
      settings.MARKETING_VERSION = mod.version;
      settings.DEVELOPMENT_TEAM = mod.ios.appleTeamId;
      settings.INFOPLIST_KEY_CFBundleDisplayName = 'Mnelo';
    }
    const target = Object.entries(mod.modResults.pbxNativeTargetSection()).find(
      ([, value]) =>
        typeof value === 'object' &&
        String(value.name).replaceAll('"', '') === 'expo-sharing-extension',
    );
    if (!target) throw new Error('Mnelo share extension target is missing.');
    const project = mod.modResults;
    const main = project.getFirstTarget().uuid;
    project.hash.project.objects.PBXTargetDependency ??= {};
    project.hash.project.objects.PBXContainerItemProxy ??= {};
    const dependencies = project.hash.project.objects.PBXTargetDependency;
    if (
      !project
        .getFirstTarget()
        .firstTarget.dependencies.some((ref) => dependencies[ref.value]?.target === target[0])
    )
      project.addTargetDependency(main, [target[0]]);
    // xcode falls back to the main app when the extension has no Resources phase.
    if (!project.buildPhase('Resources', target[0])) {
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target[0]);
    }
    let resources = project.pbxGroupByName('Resources');
    if (!resources) {
      const group = project.addPbxGroup([], 'Resources', '');
      project.addToPbxGroup(
        { fileRef: group.uuid, basename: 'Resources' },
        project.getFirstProject().firstProject.mainGroup,
      );
      resources = group.pbxGroup;
    }
    // A virtual group must not serialize an undefined directory into the project.
    if (!resources.path || resources.path === 'undefined') delete resources.path;
    for (const resource of [
      'expo-sharing-extension/PrivacyInfo.xcprivacy',
      'expo-sharing-extension/MneloShare.js',
    ]) {
      if (!project.hasFile(resource)) {
        project.addResourceFile(resource, { target: target[0] });
      }
      // Repair earlier generated projects too, without touching the app's manifest.
      const references = project.pbxFileReferenceSection();
      const reference = Object.keys(references).find(
        (key) => String(references[key]?.path).replaceAll('"', '') === resource,
      );
      const buildFiles = project.pbxBuildFileSection();
      const build = Object.keys(buildFiles).find((key) => buildFiles[key]?.fileRef === reference);
      if (!reference || !build) throw new Error('Mnelo share privacy resource is missing.');
      const phases = project.hash.project.objects.PBXResourcesBuildPhase;
      for (const phase of Object.values(phases)) {
        if (Array.isArray(phase?.files))
          phase.files = phase.files.filter((file) => file.value !== build);
      }
      project.pbxResourcesBuildPhaseObj(target[0]).files.push({
        value: build,
        comment: path.basename(resource) + ' in Resources',
      });
    }
    return mod;
  });
};
