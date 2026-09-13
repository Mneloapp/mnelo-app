const { withPodfile, withAppBuildGradle } = require('expo/config-plugins');

// Public upstream release checksum, not a credential. Pin before pod resolution
// so the vendor build phase verifies the binary archive rather than trusting a URL.
const checksum = '864c8b27e220635231754719a6891e6548d11f40fe1a6d696225d08f5bd2384e';
module.exports = function withSignal(config) {
  config = withPodfile(config, (mod) => {
    const declaration = `ENV['LIBSIGNAL_FFI_PREBUILD_CHECKSUM'] = '${checksum}'`;
    mod.modResults.contents = mod.modResults.contents.replace(
      /^ENV\['LIBSIGNAL_FFI_PREBUILD_CHECKSUM'\].*\n/gm,
      '',
    );
    mod.modResults.contents = declaration + '\n' + mod.modResults.contents;
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('SIGNAL_GRADLE_FORMAT_UNSUPPORTED');
    mod.modResults.contents = configureSignalGradle(mod.modResults.contents);
    return mod;
  });
};
function configureSignalGradle(contents) {
  const source = contents
    .replace(/\n?\/\/ @mnelo-signal-desugar:start[\s\S]*?\/\/ @mnelo-signal-desugar:end\n?/g, '')
    .trimEnd();
  return (
    source +
    `

// @mnelo-signal-desugar:start
// Required by the pinned libsignal Android AAR. Keep the existing JVM target.
android {
    compileOptions { coreLibraryDesugaringEnabled true }
}
dependencies {
    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'
}
// @mnelo-signal-desugar:end
`
  );
}
module.exports.configureSignalGradle = configureSignalGradle;
