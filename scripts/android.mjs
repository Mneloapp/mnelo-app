import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { load } from '@expo/env';
const project = resolve(import.meta.dirname, '..');
const root = join(homedir(), '.local/share/mnelo-toolchain/android');
const sdk = join(root, 'sdk');
const java = join(root, 'jdk-21.0.12.1+1/Contents/Home');
if (!existsSync(join(java, 'bin/java')) || !existsSync(join(sdk, 'platform-tools/adb')))
  throw new Error('ANDROID_TOOLCHAIN_REQUIRED: See docs/ANDROID_DEVELOPMENT.md.');
load(project, { silent: true });
const env = {
  ...process.env,
  JAVA_HOME: java,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ANDROID_AVD_HOME: join(root, 'avd'),
  GRADLE_USER_HOME: join(root, 'gradle'),
  PATH: [join(java, 'bin'), join(sdk, 'platform-tools'), process.env.PATH].join(':'),
};
function run(command, args, cwd = project) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const command = process.argv[2];
if (command === 'build' || command === 'diagnostic') {
  const diagnostic = command === 'diagnostic';
  if (diagnostic && process.env.EXPO_PUBLIC_APP_ENV !== 'local')
    throw new Error('ANDROID_DIAGNOSTIC_LOCAL_ONLY');
  const variant = diagnostic ? 'release' : 'debug';
  const space = statfsSync(project);
  const warm = existsSync(
    join(project, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`),
  );
  const minimumGiB = warm ? 2 : 5;
  if (space.bavail * space.bsize < minimumGiB * 1024 ** 3)
    throw new Error(
      `ANDROID_DISK_SPACE: At least ${minimumGiB} GiB free required before this local build.`,
    );
  if (!existsSync(join(project, 'android/gradlew')))
    throw new Error(
      'ANDROID_PREBUILD_REQUIRED: Run npx expo prebuild --platform android --no-install.',
    );
  run(
    './gradlew',
    [
      diagnostic ? ':app:assembleRelease' : ':app:assembleDebug',
      '-PreactNativeArchitectures=arm64-v8a',
      '--max-workers=2',
      '--no-daemon',
      '--stacktrace',
      '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m',
    ],
    join(project, 'android'),
  );
  const destination = join(
    project,
    diagnostic
      ? 'artifacts/android/mnelo-local-diagnostic-arm64.apk'
      : 'artifacts/android/mnelo-development-arm64.apk',
  );
  mkdirSync(join(project, 'artifacts/android'), { recursive: true });
  copyFileSync(
    join(project, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`),
    destination,
  );
  console.log(
    (diagnostic ? 'Standalone local diagnostic APK: ' : 'Development APK: ') +
      destination +
      ' (debug signing, ARM64 only; not a cloud preview or store artifact).',
  );
} else if (command === 'run') {
  run(process.execPath, [
    join(project, 'node_modules/expo/bin/cli'),
    'run:android',
    ...process.argv.slice(3),
  ]);
} else if (command === 'devices') {
  run('adb', ['devices', '-l']);
} else if (command === 'install') {
  const serial = process.argv[3];
  if (!serial || !/^[A-Za-z0-9_.:-]+$/.test(serial))
    throw new Error('ANDROID_DEVICE_SERIAL_REQUIRED');
  run('adb', [
    '-s',
    serial,
    'install',
    '-r',
    join(project, 'artifacts/android/mnelo-development-arm64.apk'),
  ]);
  for (const port of [8083, 8084])
    run('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  // Current messenger signaling and Metro use per-device loopback tunnels. No legacy backend tunnel.
  run('adb', [
    '-s',
    serial,
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'mnelo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8083',
    'com.mnelo.messenger',
  ]);
} else throw new Error('ANDROID_COMMAND: build | diagnostic | run | devices | install <serial>');
