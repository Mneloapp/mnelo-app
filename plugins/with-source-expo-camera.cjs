const { withDangerousMod, withPodfile } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * expo-camera ships its barcode provider as an XCFramework beside the
 * source files. When all Expo modules are built from source, CocoaPods also
 * discovers that nested framework and tries to copy both simulator slices,
 * producing duplicate Swift headers. The barcode provider is linked from its
 * source pod, so the bundled framework is not needed in this build mode.
 */
module.exports = function withSourceExpoCamera(config) {
  config = withPodfile(config, (mod) => {
    // The main app target receives LibSignalClient through expo-build-properties'
    // `extraPods` hook. Share and notification extensions do not call
    // `use_expo_modules!`, so their MneloShareRuntime dependency needs the same
    // pinned source declaration in each extension target for clean prebuilds.
    const libSignalPod =
      "  pod 'LibSignalClient', :git => 'https://github.com/signalapp/libsignal.git', :tag => 'v0.102.2'";
    for (const targetName of ['MneloIntents', 'MneloNotifications', 'expo-sharing-extension']) {
      const marker = `# @mnelo-extension-libsignal-${targetName}`;
      if (!mod.modResults.contents.includes(marker)) {
        const targetHeader = `target '${targetName}' do\n`;
        mod.modResults.contents = mod.modResults.contents.replace(
          targetHeader,
          `${targetHeader}${marker}\n${libSignalPod}\n`,
        );
      }
    }

    // LiveKit's WebRTC headers include React Native headers while this
    // project uses static frameworks. Allow those headers in the source
    // build; the precompiled WebRTC build already carries the same setting.
    const marker = '# @mnelo-source-expo-camera-nonmodular';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /post_install do \|installer\|\n([\s\S]*?)\n  end\nend\n\ntarget 'Mnelo(?:Intents|Notifications)'/,
        (block) =>
          block.replace(
            /\n  end\nend\n\n(target 'Mnelo(?:Intents|Notifications)')/,
            `\n    ${marker}\n    installer.pods_project.targets.each do |target|\n      target.build_configurations.each do |build_config|\n        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'\n      end\n    end\n  end\nend\n\n$1`,
          ),
      );
    }
    return mod;
  });
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const framework = path.join(
        mod.modRequest.projectRoot,
        'node_modules/expo-camera/ios/ExpoCameraBarcodeScanning.xcframework',
      );
      if (fs.existsSync(framework)) fs.rmSync(framework, { recursive: true, force: true });
      return mod;
    },
  ]);
};
