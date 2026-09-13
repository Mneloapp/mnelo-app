import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('ANDROID_SETUP_HOST: This pinned setup is for Apple Silicon macOS.');
const root = join(homedir(), '.local/share/mnelo-toolchain/android');
const sdk = join(root, 'sdk');
const jdk = join(root, 'jdk-21.0.12.1+1/Contents/Home');
mkdirSync(root, { recursive: true });
function install(url, checksum, archive, destination, args) {
  if (existsSync(destination)) return;
  const path = join(root, archive);
  execFileSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--fail',
      '--location',
      '--retry',
      '2',
      '--max-time',
      '600',
      '--output',
      path,
      url,
    ],
    { stdio: 'inherit' },
  );
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== checksum)
    throw new Error('ANDROID_SETUP_CHECKSUM');
  execFileSync(args[0], [...args.slice(1), path], { stdio: 'inherit' });
  rmSync(path);
  if (!existsSync(destination)) throw new Error('ANDROID_SETUP_LAYOUT');
}
install(
  'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.12.1_1.tar.gz',
  '3623232f33a9c3baadf304480b2535f9a3cba8a58d42ecbb438ba267315d9998',
  'jdk.tar.gz',
  jdk,
  ['tar', '-x', '-C', root, '-f'],
);
mkdirSync(sdk, { recursive: true });
const commandTools = join(sdk, 'cmdline-tools/22.0');
if (!existsSync(join(commandTools, 'bin/sdkmanager'))) {
  const staging = join(root, 'command-tools-staging');
  mkdirSync(staging, { recursive: true });
  install(
    'https://dl.google.com/android/repository/commandlinetools-mac_arm64-15859902_latest.zip',
    '835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e',
    'command-line-tools.zip',
    join(staging, 'cmdline-tools/bin/sdkmanager'),
    ['unzip', '-q', '-d', staging],
  );
  mkdirSync(join(sdk, 'cmdline-tools'), { recursive: true });
  renameSync(join(staging, 'cmdline-tools'), commandTools);
  rmSync(staging, { recursive: true });
}
const env = {
  ...process.env,
  JAVA_HOME: jdk,
  ANDROID_HOME: sdk,
  PATH: join(jdk, 'bin') + ':' + process.env.PATH,
};
execFileSync(join(jdk, 'bin/java'), ['-version'], { env, stdio: 'inherit' });
execFileSync(join(commandTools, 'bin/sdkmanager'), ['--sdk_root=' + sdk, '--version'], {
  env,
  stdio: 'inherit',
});
console.log('Android bootstrap installed. SDK packages are installed separately with sdkmanager.');
