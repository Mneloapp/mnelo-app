// eslint-disable-next-line @typescript-eslint/no-require-imports
const { configureSignalGradle } = require('../plugins/with-signal.cjs') as {
  configureSignalGradle: (value: string) => string;
};
test('Signal Android desugaring survives regeneration without duplicating or replacing the app JVM configuration', () => {
  const original =
    'android { compileOptions { sourceCompatibility JavaVersion.VERSION_17 } }\ndependencies { implementation "fixture" }\n';
  const once = configureSignalGradle(original);
  expect(configureSignalGradle(once)).toBe(once);
  expect(once).toContain('sourceCompatibility JavaVersion.VERSION_17');
  expect(once).toContain('coreLibraryDesugaringEnabled true');
  expect(once).toContain('com.android.tools:desugar_jdk_libs:2.1.5');
  expect(once.match(/coreLibraryDesugaring '/g)).toHaveLength(1);
});
