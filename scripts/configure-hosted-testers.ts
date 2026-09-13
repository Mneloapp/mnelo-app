import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { prepareTesterConfiguration } from '../identity/tester-configuration';

// Operator-only utility. Canonical phone array arrives through encrypted SSH stdin,
// never argv, shell history, an environment file, Git or mobile configuration.
async function main() {
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || process.argv.length !== 2)
    throw new Error();
  process.umask(0o077);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 4096) throw new Error();
    chunks.push(chunk);
  }
  const phones: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const directory = '/etc/mnelo';
  const target = directory + '/identity.env';
  const lock = directory + '/.testers.lock';
  const temporary = directory + '/.identity.env.next';
  const lockFd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  let createdTemporary = false;
  const readPrivateFile = (path: string, rootOnly: boolean) => {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o777) !== 0o600 ||
        (rootOnly && stat.uid !== 0)
      )
        throw new Error();
      return readFileSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  try {
    const config = readPrivateFile(target, true).toString('utf8');
    const key = readPrivateFile('/var/lib/mnelo-identity/.local/phone-sms/index.key', false);
    const update = prepareTesterConfiguration(config, key, phones);
    if (update.changed) {
      const fd = openSync(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      createdTemporary = true;
      try {
        writeFileSync(fd, update.config);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, target);
      createdTemporary = false;
      const directoryFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        fsyncSync(directoryFd);
      } finally {
        closeSync(directoryFd);
      }
    }
    process.stdout.write(
      `HOSTED_TESTERS_CONFIGURED: ${update.count}; ${update.changed ? 'restart identity to apply' : 'unchanged'}; registry and budget preserved\n`,
    );
  } finally {
    if (createdTemporary) unlinkSync(temporary);
    closeSync(lockFd);
    unlinkSync(lock);
  }
}
void main().catch(() => {
  process.stderr.write(
    'HOSTED_TESTER_UPDATE_FAILED: inspect configuration privately; no key or registry replacement\n',
  );
  process.exitCode = 1;
});
