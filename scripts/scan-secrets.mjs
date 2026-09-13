import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  lstatSync,
  chmodSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
const version = '8.30.1';
const platform =
  process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null;
const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
if (!platform || !arch) throw new Error('SECRET_SCAN_PLATFORM_UNSUPPORTED');
const root = resolve('artifacts/secret-scan');
const metadata = JSON.parse(readFileSync('dist/metadata.json', 'utf8'));
for (const target of ['ios', 'android']) {
  const bundle = metadata.fileMetadata?.[target]?.bundle;
  if (
    typeof bundle !== 'string' ||
    !resolve('dist', bundle).startsWith(resolve('dist') + '/') ||
    lstatSync(resolve('dist', bundle)).size < 1
  )
    throw new Error('SECRET_SCAN_MOBILE_BUNDLES_REQUIRED');
}
const directory = join(root, 'tool', version);
mkdirSync(directory, { recursive: true });
const archiveName = `gitleaks_${version}_${platform}_${arch}.tar.gz`;
const archive = join(directory, archiveName);
const binary = join(directory, 'gitleaks');
const base = `https://github.com/gitleaks/gitleaks/releases/download/v${version}/`;
async function download(name) {
  const result = await fetch(base + name, { signal: AbortSignal.timeout(60000) });
  if (!result.ok) throw new Error('SECRET_SCANNER_DOWNLOAD_FAILED');
  return Buffer.from(await result.arrayBuffer());
}
// Re-verify the archive on each invocation rather than trusting a cached executable.
const checksums = (await download(`gitleaks_${version}_checksums.txt`)).toString('utf8');
let bytes;
try {
  bytes = readFileSync(archive);
} catch {
  bytes = await download(archiveName);
}
const expected = checksums
  .split('\n')
  .find((line) => line.trim().split(/\s+/)[1] === archiveName)
  ?.split(/\s+/)[0];
if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('SECRET_SCANNER_CHECKSUM_FAILED');
writeFileSync(archive, bytes);
execFileSync('tar', ['-xzf', archive, '-C', directory, 'gitleaks'], { stdio: 'pipe' });
chmodSync(binary, 0o755);
const snapshot = join(root, 'source');
rmSync(snapshot, { recursive: true, force: true });
mkdirSync(snapshot, { recursive: true });
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
];
for (const file of files) {
  const source = resolve(file);
  if (!source.startsWith(process.cwd() + '/')) throw new Error('SECRET_SCAN_PATH_INVALID');
  let info;
  try {
    info = lstatSync(source);
  } catch {
    continue;
  } // Locally deleted tracked files.
  if (!info.isFile()) throw new Error('SECRET_SCAN_NONREGULAR_SOURCE');
  const target = join(snapshot, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
const tasks = [
  ['history', ['git', '--log-opts=--all']],
  ['source', ['dir', snapshot]],
  ['bundles', ['dir', resolve('dist')]],
];
let failed = false;
for (const [name, args] of tasks) {
  const report = join(root, name + '.json');
  const result = spawnSync(
    binary,
    [...args, '--redact=100', '--no-banner', '--report-format=json', '--report-path=' + report],
    { encoding: 'utf8', timeout: 120000 },
  );
  writeFileSync(join(root, name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''), {
    mode: 0o600,
  });
  let findings;
  try {
    findings = JSON.parse(readFileSync(report, 'utf8')).length;
  } catch {
    findings = 'unavailable';
  }
  console.log(
    `Gitleaks ${version}: ${name}: ${result.status === 0 ? 'PASS' : 'FAIL'}; findings=${findings}`,
  );
  if (result.status !== 0) failed = true;
}
// Source copies can contain a newly discovered secret; reports/logs are redacted, copies are disposable.
rmSync(snapshot, { recursive: true, force: true });
if (failed) process.exitCode = 1;
