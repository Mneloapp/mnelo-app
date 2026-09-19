require('tsx/cjs');
const { releaseBundleExports } = require('../config/native-build-environment.ts');

try {
  let snapshot;
  try {
    snapshot = JSON.parse(process.argv[2]);
  } catch {
    throw new Error('NATIVE_BUILD_ENVIRONMENT_INVALID');
  }
  process.stdout.write(releaseBundleExports(snapshot, process.argv[3] ?? '', process.env));
} catch (error) {
  // Configuration contains only public data, but never echo arguments or environment.
  console.error(
    `error: ${error instanceof Error ? error.message : 'NATIVE_BUILD_ENVIRONMENT_INVALID'}`,
  );
  process.exitCode = 1;
}
