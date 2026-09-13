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
      fs.writeFileSync(infoPath, plist.build(info));
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
    return mod;
  });
};
