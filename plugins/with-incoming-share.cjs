const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;

// Keep Expo's native receiving bridge, with Mnelo branding and isolated, protected,
// expiring attachment copies. Never give the extension access to the chat database.
module.exports = function withIncomingShare(config) {
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, 'expo-sharing-extension');
      const source = path.join(directory, 'ShareIntoViewController.swift');
      const template = path.join(
        path.dirname(require.resolve('expo-sharing/package.json')),
        'plugin/template-files/ios/ShareIntoViewController.swift',
      );
      let swift = fs.readFileSync(template, 'utf8');
      const replace = (from, to) => {
        if (!swift.includes(from))
          throw new Error('Expo sharing template changed; review the native inbox adaptation.');
        swift = swift.replace(from, to);
      };
      replace(
        '  private func handleShare() {',
        '  private var handlingShare = false\n\n  private func handleShare() {\n    guard !handlingShare else { return }\n    handlingShare = true',
      );
      replace(
        '    let destinationURL = containerURL.appendingPathComponent(fileName)',
        '    guard let destinationURL = incomingFile(container: containerURL, name: fileName) else { return nil }',
      );
      replace(
        '    let destinationURL = containerURL.appendingPathComponent(fileName)',
        '    guard let destinationURL = incomingFile(container: containerURL, name: fileName) else { return nil }',
      );
      replace(
        '  // MARK: - File Management',
        `  // MARK: - File Management

  private func incomingFile(container: URL, name: String) -> URL? {
    let manager = FileManager.default
    var inbox = container.appendingPathComponent("MneloIncoming", isDirectory: true)
    do {
      try manager.createDirectory(at: inbox, withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try inbox.setResourceValues(values)
      // Unsent drafts expire locally. Do not touch any other app-group files.
      for child in (try? manager.contentsOfDirectory(at: inbox, includingPropertiesForKeys: [.creationDateKey])) ?? [] {
        if let date = try? child.resourceValues(forKeys: [.creationDateKey]).creationDate,
          date < Date().addingTimeInterval(-86400) { try? manager.removeItem(at: child) }
      }
      let folder = inbox.appendingPathComponent(UUID().uuidString, isDirectory: true)
      try manager.createDirectory(at: folder, withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      return folder.appendingPathComponent((name as NSString).lastPathComponent)
    } catch { return nil }
  }
`,
      );
      replace('import UIKit', 'import UIKit\nimport Intents\nimport CryptoKit');
      replace(
        '      userDefaults.set(encoded, forKey: SHARE_INTO_DEFAULTS_KEY)',
        `      let conversation = (extensionContext?.intent as? INSendMessageIntent)?.conversationIdentifier
      let digest = SHA256.hash(data: encoded).map { String(format: "%02x", $0) }.joined()
      userDefaults.set(["digest": digest, "conversation": conversation ?? ""], forKey: "MneloShareContext")
      userDefaults.set(encoded, forKey: SHARE_INTO_DEFAULTS_KEY)`,
      );
      // Keep security-scoped source access open until the app-group copy is complete.
      replace(
        '    let fileName = url.lastPathComponent.isEmpty',
        '    let scoped = url.startAccessingSecurityScopedResource()\n    defer { if scoped { url.stopAccessingSecurityScopedResource() } }\n    let fileName = url.lastPathComponent.isEmpty',
      );
      // Copies may otherwise inherit a source file's weaker protection class.
      replace(
        '      try FileManager.default.copyItem(at: url, to: destinationURL)',
        '      try FileManager.default.copyItem(at: url, to: destinationURL)\n      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destinationURL.path)',
      );
      replace(
        '      try data.write(to: destinationURL)',
        '      try data.write(to: destinationURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])',
      );
      fs.writeFileSync(source, swift);
      const infoPath = path.join(directory, 'Info.plist');
      const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
      info.CFBundleDisplayName = 'Mnelo';
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
    const resource = 'expo-sharing-extension/PrivacyInfo.xcprivacy';
    const target = Object.entries(mod.modResults.pbxNativeTargetSection()).find(
      ([, value]) =>
        typeof value === 'object' &&
        String(value.name).replaceAll('"', '') === 'expo-sharing-extension',
    );
    if (!target) throw new Error('Mnelo share extension target is missing.');
    const project = mod.modResults;
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
      comment: 'PrivacyInfo.xcprivacy in Resources',
    });
    return mod;
  });
};
