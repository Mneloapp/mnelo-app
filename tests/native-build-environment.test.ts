import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  captureNativeBuildEnvironment,
  guardedBundlePhase,
  nativeXcodeEnvironment,
  releaseBundleExports,
  validateNativeBuildEnvironment,
} from '../config/native-build-environment';

// URL configuration does not use crypto; the real CLI subprocess below loads it
// through Node/tsx, where the Signal helper's ESM dependencies are supported.
jest.mock('../src/messenger/crypto', () => ({}));

const beta = {
  EAS_BUILD_PROFILE: 'testflight',
  EXPO_PUBLIC_APP_ENV: 'preview',
  EXPO_PUBLIC_RELAY_URL: 'wss://relay-dev.mnelo.com/',
  EXPO_PUBLIC_PHONE_IDENTITY_URL: 'https://identity-dev.mnelo.com',
  EXPO_PUBLIC_DELIVERY_V2: '1',
};
const snapshot = captureNativeBuildEnvironment(beta);

it('carries only the selected public build values, without credentials', () => {
  expect(captureNativeBuildEnvironment({ ...beta, SERVER_SECRET: 'private-value' })).toEqual(
    snapshot,
  );
  expect(() => validateNativeBuildEnvironment(snapshot, true)).not.toThrow();
});

it('refuses a release prebuilt without an explicitly selected hosted environment', () => {
  expect(() => releaseBundleExports(captureNativeBuildEnvironment({}), 'Release', {})).toThrow(
    'NATIVE_RELEASE_ENVIRONMENT_REQUIRED',
  );
  expect(releaseBundleExports(captureNativeBuildEnvironment({}), 'Debug', {})).toBe('');
});

it('allows an explicit loopback-only local Release diagnostic without a store profile', () => {
  const diagnostic = {
    MNELO_LOCAL_RELEASE_DIAGNOSTIC: '1',
    EXPO_PUBLIC_APP_ENV: 'local',
    EXPO_PUBLIC_RELAY_URL: 'ws://127.0.0.1:8081',
    EXPO_PUBLIC_PHONE_IDENTITY_URL: 'http://localhost:8086',
  };
  expect(releaseBundleExports(captureNativeBuildEnvironment(diagnostic), 'Release', {})).toContain(
    "export EXPO_PUBLIC_APP_ENV='local'",
  );
  for (const invalid of [
    { ...diagnostic, EXPO_PUBLIC_APP_ENV: undefined },
    { ...diagnostic, EXPO_PUBLIC_PHONE_IDENTITY_URL: undefined },
    { ...diagnostic, EXPO_PUBLIC_PHONE_IDENTITY_URL: 'https://identity-dev.mnelo.com' },
    { ...beta, MNELO_LOCAL_RELEASE_DIAGNOSTIC: '1' },
  ])
    expect(() =>
      releaseBundleExports(captureNativeBuildEnvironment(invalid), 'Release', {}),
    ).toThrow('NATIVE_LOCAL_DIAGNOSTIC_CONFIGURATION_INVALID');
});

it.each(['EXPO_PUBLIC_RELAY_URL', 'EXPO_PUBLIC_PHONE_IDENTITY_URL'] as const)(
  'refuses an archive missing %s',
  (key) => {
    const input: Record<string, string> = { ...beta };
    delete input[key];
    expect(() => releaseBundleExports(captureNativeBuildEnvironment(input), 'Release', {})).toThrow(
      'NATIVE_RELEASE_ENDPOINTS_REQUIRED',
    );
  },
);

it('refuses an archive falling back to the legacy message transport', () => {
  expect(() =>
    releaseBundleExports(
      captureNativeBuildEnvironment({ ...beta, EXPO_PUBLIC_DELIVERY_V2: '0' }),
      'Release',
      {},
    ),
  ).toThrow('NATIVE_RELEASE_DELIVERY_REQUIRED');
});

it('refuses mismatched local overrides, profile changes and disabled bundling/inlining', () => {
  expect(() =>
    releaseBundleExports(snapshot, 'Release', { EXPO_PUBLIC_PHONE_IDENTITY_URL: '' }),
  ).toThrow('NATIVE_BUILD_ENVIRONMENT_CHANGED');
  for (const override of [
    { EAS_BUILD_PROFILE: 'production' },
    { SKIP_BUNDLING: '1' },
    { EXPO_NO_CLIENT_ENV_VARS: '1' },
    { EXPO_NO_CLIENT_ENV_VARS: 'true' },
  ])
    expect(() => releaseBundleExports(snapshot, 'Release', override)).toThrow(
      'NATIVE_RELEASE_BUNDLE_CONFIGURATION_INVALID',
    );
});

it('rejects unreviewed endpoints and incompatible EAS profiles', () => {
  expect(() =>
    validateNativeBuildEnvironment(
      captureNativeBuildEnvironment({
        ...beta,
        EXPO_PUBLIC_PHONE_IDENTITY_URL: 'http://localhost',
      }),
      true,
    ),
  ).toThrow('PHONE_SERVICE_CONFIGURATION_INVALID');
  expect(() =>
    validateNativeBuildEnvironment(
      captureNativeBuildEnvironment({ ...beta, EAS_BUILD_PROFILE: 'production' }),
      true,
    ),
  ).toThrow('CONFIG_ENV_PROFILE_MISMATCH');
});

it('regenerates the shared Xcode environment without accumulating stale public exports', () => {
  const original = 'export NODE_BINARY=/usr/local/bin/node\n';
  const generated = nativeXcodeEnvironment(original, snapshot);
  expect(nativeXcodeEnvironment(generated, snapshot)).toBe(generated);
  const local = nativeXcodeEnvironment(generated, captureNativeBuildEnvironment({}));
  expect(local).toContain('export NODE_BINARY=/usr/local/bin/node');
  expect(local).toContain('unset EXPO_PUBLIC_PHONE_IDENTITY_URL');
  expect(local).not.toContain('identity-dev.mnelo.com');
});

it('places an idempotent archive guard after local overrides and before native bundling', () => {
  const original = 'source "$PROJECT_DIR/.xcode.env.local"\n"/example/react-native-xcode.sh"\n';
  const guarded = guardedBundlePhase(original, snapshot);
  expect(guardedBundlePhase(guarded, snapshot)).toBe(guarded);
  expect(guarded.indexOf('ios-bundle-environment.cjs')).toBeGreaterThan(
    guarded.indexOf('.xcode.env.local'),
  );
  expect(guarded.indexOf('ios-bundle-environment.cjs')).toBeLessThan(
    guarded.indexOf('/example/react-native-xcode.sh'),
  );
  expect(() => guardedBundlePhase('unknown bundle command', snapshot)).toThrow(
    'NATIVE_BUNDLE_PHASE_NOT_FOUND',
  );
});

it('restores the selected prebuild values with no Xcode-local env, and fails before bundling on a stale override', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-build-environment-'));
  const bundle = join(directory, 'react-native-xcode.sh');
  const result = join(directory, 'result.json');
  const script = join(directory, 'bundle.sh');
  writeFileSync(
    bundle,
    `#!/bin/bash\n"$NODE_BINARY" -e 'process.stdout.write(JSON.stringify({environment:process.env.EXPO_PUBLIC_APP_ENV,phone:process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,relay:process.env.EXPO_PUBLIC_RELAY_URL,delivery:process.env.EXPO_PUBLIC_DELIVERY_V2,dotenv:process.env.EXPO_NO_DOTENV}))' > "$MNELO_TEST_RESULT"\n`,
    { mode: 0o700 },
  );
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv))
    if (key.startsWith('EXPO_PUBLIC_') || key === 'EAS_BUILD_PROFILE') delete childEnv[key];
  Object.assign(childEnv, {
    PROJECT_ROOT: resolve(__dirname, '..'),
    NODE_BINARY: process.execPath,
    CONFIGURATION: 'Release',
    MNELO_TEST_RESULT: result,
  });
  try {
    writeFileSync(script, guardedBundlePhase(`"${bundle}"\n`, snapshot));
    execFileSync('/bin/bash', [script], { env: childEnv, stdio: 'pipe' });
    expect(JSON.parse(readFileSync(result, 'utf8'))).toEqual({
      environment: 'preview',
      phone: beta.EXPO_PUBLIC_PHONE_IDENTITY_URL,
      relay: beta.EXPO_PUBLIC_RELAY_URL,
      delivery: '1',
      dotenv: '1',
    });
    rmSync(result);
    const failed = spawnSync('/bin/bash', [script], {
      env: { ...childEnv, EXPO_PUBLIC_APP_ENV: 'local' },
      encoding: 'utf8',
    });
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain('NATIVE_BUILD_ENVIRONMENT_CHANGED');
    expect(() => readFileSync(result)).toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
