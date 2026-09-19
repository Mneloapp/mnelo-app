const {
  withDangerousMod,
  withXcodeProject,
  withPodfile,
  withInfoPlist,
  withEntitlementsPlist,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { writeIntentVocabulary, configureIntentVocabulary } = require('./intent-vocabulary.cjs');
const targetName = 'MneloIntents';
const bundleId = 'com.mnelo.messenger.intents';
module.exports = function withMessageIntents(config) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.siri'] = true;
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSiriUsageDescription =
      require('../src/i18n/native/en.json').ios.NSSiriUsageDescription;
    return mod;
  });
  config = withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes("target 'MneloIntents'"))
      mod.modResults.contents +=
        "\ntarget 'MneloIntents' do\n  use_frameworks! :linkage => :static\n  pod 'MneloShareRuntime', :path => '../modules/mnelo-share-runtime/ios'\nend\n";
    return mod;
  });
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      writeIntentVocabulary(mod.modRequest.platformProjectRoot);
      const directory = path.join(mod.modRequest.platformProjectRoot, targetName);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'MessageIntentHandler.swift'),
        'import MneloShareRuntime\nclass MessageIntentHandler: MneloMessageIntentHandler {}\n',
      );
      require('../scripts/build-share-extension.cjs').buildIntentExtension(
        mod.modRequest.projectRoot,
        path.join(directory, 'MneloIntents.js'),
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
          NSExtension: {
            NSExtensionPointIdentifier: 'com.apple.intents-service',
            NSExtensionAttributes: {
              IntentsSupported: ['INSendMessageIntent'],
              IntentsRestrictedWhileLocked: [],
              IntentsRestrictedWhileProtectedDataUnavailable: ['INSendMessageIntent'],
            },
            NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).MessageIntentHandler',
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
    configureIntentVocabulary(project);
    project.hash.project.objects.PBXTargetDependency ??= {};
    project.hash.project.objects.PBXContainerItemProxy ??= {};
    let entry = Object.entries(project.pbxNativeTargetSection()).find(
      ([key, value]) =>
        !key.endsWith('_comment') && String(value.name).replaceAll('"', '') === targetName,
    );
    if (!entry) {
      const target = project.addTarget(targetName, 'app_extension', targetName, bundleId);
      project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
      entry = [target.uuid, target.pbxNativeTarget];
    }
    configureTargetFiles(project, entry[1]);
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

// node-xcode's filename helpers deduplicate globally by path, including the
// PBXBuildFile itself. Extension manifests share a basename, but neither the
// file reference nor its build-file entry may have two parents. Use qualified
// source-root paths and distinct entries for this target; also repair projects
// generated by the old basename-only helpers without touching another target.
function configureTargetFiles(project, target) {
  const objects = project.hash.project.objects;
  let group = Object.entries(objects.PBXGroup).find(
    ([key, value]) => !key.endsWith('_comment') && value.name === targetName,
  );
  if (!group) {
    const created = project.addPbxGroup([], targetName, targetName);
    project.addToPbxGroup(created.uuid, project.getFirstProject().firstProject.mainGroup);
    group = [created.uuid, created.pbxGroup];
  }
  group[1].children = [];
  const specifications = [
    ['PBXSourcesBuildPhase', 'MessageIntentHandler.swift', 'sourcecode.swift'],
    ['PBXResourcesBuildPhase', 'MneloIntents.js', 'sourcecode.javascript'],
    ['PBXResourcesBuildPhase', 'PrivacyInfo.xcprivacy', 'text.xml'],
  ];
  const phases = {};
  for (const [type] of specifications) {
    const phase = target.buildPhases.map((ref) => objects[type]?.[ref.value]).find(Boolean);
    if (!phase) throw new Error(`Missing ${targetName} ${type}`);
    if (!phases[type]) phase.files = [];
    phases[type] = phase;
  }
  for (const [type, name, fileType] of specifications) {
    const qualified = `${targetName}/${name}`;
    let reference = Object.entries(objects.PBXFileReference).find(
      ([key, value]) =>
        !key.endsWith('_comment') && String(value.path).replaceAll('"', '') === qualified,
    );
    if (!reference) {
      const id = project.generateUuid();
      const value = {
        isa: 'PBXFileReference',
        name: `"${name}"`,
        path: `"${qualified}"`,
        sourceTree: 'SOURCE_ROOT',
        lastKnownFileType: fileType,
      };
      objects.PBXFileReference[id] = value;
      objects.PBXFileReference[`${id}_comment`] = name;
      reference = [id, value];
    }
    reference[1].sourceTree = 'SOURCE_ROOT';
    group[1].children.push({ value: reference[0], comment: name });
    let build = Object.entries(objects.PBXBuildFile).find(
      ([key, value]) => !key.endsWith('_comment') && value.fileRef === reference[0],
    );
    if (!build) {
      const id = project.generateUuid();
      const value = { isa: 'PBXBuildFile', fileRef: reference[0], fileRef_comment: name };
      objects.PBXBuildFile[id] = value;
      objects.PBXBuildFile[`${id}_comment`] = name;
      build = [id, value];
    }
    phases[type].files.push({ value: build[0], comment: name });
  }
}
