import { z } from 'zod';
import { messengerEnvironment } from '../src/messenger/environment';

const publicKeys = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_RELAY_URL',
  'EXPO_PUBLIC_PHONE_IDENTITY_URL',
  'EXPO_PUBLIC_DELIVERY_V2',
] as const;
const snapshotSchema = z
  .object({
    profile: z.string().nullable(),
    localDiagnostic: z.boolean(),
    variables: z
      .object({
        EXPO_PUBLIC_APP_ENV: z.string().nullable(),
        EXPO_PUBLIC_RELAY_URL: z.string().nullable(),
        EXPO_PUBLIC_PHONE_IDENTITY_URL: z.string().nullable(),
        EXPO_PUBLIC_DELIVERY_V2: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
type BuildEnvironment = z.infer<typeof snapshotSchema>;
type Environment = Record<string, string | undefined>;

/** Only these public values cross from Expo prebuild into native build scripts. */
export function captureNativeBuildEnvironment(env: Environment): BuildEnvironment {
  return {
    profile: env.EAS_BUILD_PROFILE ?? null,
    localDiagnostic: env.MNELO_LOCAL_RELEASE_DIAGNOSTIC === '1',
    variables: {
      EXPO_PUBLIC_APP_ENV: env.EXPO_PUBLIC_APP_ENV ?? null,
      EXPO_PUBLIC_RELAY_URL: env.EXPO_PUBLIC_RELAY_URL ?? null,
      EXPO_PUBLIC_PHONE_IDENTITY_URL: env.EXPO_PUBLIC_PHONE_IDENTITY_URL ?? null,
      EXPO_PUBLIC_DELIVERY_V2: env.EXPO_PUBLIC_DELIVERY_V2 ?? null,
    },
  };
}

export function validateNativeBuildEnvironment(input: unknown, release: boolean) {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) throw new Error('NATIVE_BUILD_ENVIRONMENT_INVALID');
  const snapshot = parsed.data;
  const values = snapshot.variables;
  const appEnv = values.EXPO_PUBLIC_APP_ENV ?? 'local';
  const expected =
    snapshot.profile === 'testflight'
      ? 'preview'
      : snapshot.profile === 'development-simulator'
        ? 'development'
        : snapshot.profile;
  if (expected && appEnv !== expected) throw new Error('CONFIG_ENV_PROFILE_MISMATCH');
  if (release && snapshot.localDiagnostic) {
    // Embedded local Release probes are deliberate development artifacts, never
    // a default for an archive whose environment was accidentally omitted.
    if (
      snapshot.profile !== null ||
      values.EXPO_PUBLIC_APP_ENV !== 'local' ||
      ![values.EXPO_PUBLIC_RELAY_URL, values.EXPO_PUBLIC_PHONE_IDENTITY_URL].every((value) => {
        if (!value) return false;
        try {
          return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
        } catch {
          return false;
        }
      })
    )
      throw new Error('NATIVE_LOCAL_DIAGNOSTIC_CONFIGURATION_INVALID');
  } else if (release) {
    if (!['preview', 'production'].includes(appEnv))
      throw new Error('NATIVE_RELEASE_ENVIRONMENT_REQUIRED');
    if (!values.EXPO_PUBLIC_RELAY_URL || !values.EXPO_PUBLIC_PHONE_IDENTITY_URL)
      throw new Error('NATIVE_RELEASE_ENDPOINTS_REQUIRED');
    // A missing switch silently falls back to the old foreground-only transport.
    if (values.EXPO_PUBLIC_DELIVERY_V2 !== '1') throw new Error('NATIVE_RELEASE_DELIVERY_REQUIRED');
  }
  messengerEnvironment({
    appEnv,
    relayUrl: values.EXPO_PUBLIC_RELAY_URL ?? undefined,
    phoneIdentityUrl: values.EXPO_PUBLIC_PHONE_IDENTITY_URL ?? undefined,
  });
  return snapshot;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function nativeEnvironmentExports(snapshot: BuildEnvironment) {
  const values = {
    ...snapshot.variables,
    EAS_BUILD_PROFILE: snapshot.profile,
    MNELO_LOCAL_RELEASE_DIAGNOSTIC: snapshot.localDiagnostic ? '1' : null,
    EXPO_NO_DOTENV: '1',
  };
  return Object.entries(values)
    .map(([key, value]) => (value === null ? `unset ${key}` : `export ${key}=${shellQuote(value)}`))
    .join('\n');
}

/** Runs immediately before bundling, after Xcode has loaded any local overrides. */
export function releaseBundleExports(input: unknown, configuration: string, current: Environment) {
  if (configuration.includes('Debug')) return '';
  const snapshot = validateNativeBuildEnvironment(input, true);
  for (const key of publicKeys) {
    if (current[key] !== undefined && current[key] !== snapshot.variables[key])
      throw new Error('NATIVE_BUILD_ENVIRONMENT_CHANGED: rerun Expo prebuild for this profile.');
  }
  if (
    (current.EAS_BUILD_PROFILE !== undefined && current.EAS_BUILD_PROFILE !== snapshot.profile) ||
    (current.MNELO_LOCAL_RELEASE_DIAGNOSTIC !== undefined &&
      current.MNELO_LOCAL_RELEASE_DIAGNOSTIC !== (snapshot.localDiagnostic ? '1' : null)) ||
    (current.EXPO_NO_CLIENT_ENV_VARS &&
      !['0', 'false'].includes(current.EXPO_NO_CLIENT_ENV_VARS.toLowerCase())) ||
    current.SKIP_BUNDLING
  )
    throw new Error('NATIVE_RELEASE_BUNDLE_CONFIGURATION_INVALID');
  return nativeEnvironmentExports(snapshot);
}

const markerStart = '# @mnelo-native-build-environment';
const markerEnd = '# @end-mnelo-native-build-environment';
const managedBlock = new RegExp(`${markerStart}\\n[\\s\\S]*?${markerEnd}\\n?`, 'g');

export function nativeXcodeEnvironment(source: string, snapshot: BuildEnvironment) {
  return `${source.replace(managedBlock, '').trimEnd()}\n${markerStart}\n${nativeEnvironmentExports(snapshot)}\n${markerEnd}\n`;
}

export function guardedBundlePhase(source: string, snapshot: BuildEnvironment) {
  const clean = source.replace(managedBlock, '');
  // Keep the check after .xcode.env.local, directly before Expo invokes bundling.
  const invocation = /^.*react-native-xcode\.sh.*$/m;
  if (!invocation.test(clean)) throw new Error('NATIVE_BUNDLE_PHASE_NOT_FOUND');
  const guard = `${markerStart}\nMNELO_BUNDLE_ENV=$("$NODE_BINARY" "$PROJECT_ROOT/scripts/ios-bundle-environment.cjs" ${shellQuote(JSON.stringify(snapshot))} "$CONFIGURATION") || exit 1\neval "$MNELO_BUNDLE_ENV"\n${markerEnd}\n`;
  return clean.replace(invocation, (line) => guard + line);
}
