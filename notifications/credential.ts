import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

// systemd LoadCredential uses a root-owned, read-only mount with a per-service
// ACL. Its 0440 mode does not mean the private source file became group-readable.
// Accept that exact protected location; ordinary files must remain owner-only.
export function readPushCredential(file: string) {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    const mode = stat.mode & 0o777;
    if (!stat.isFile()) throw new Error('PUSH_CONFIGURATION_INVALID');
    if ((mode & 0o077) !== 0) {
      const credentials = process.env.CREDENTIALS_DIRECTORY;
      if (
        process.platform !== 'linux' ||
        !credentials ||
        !resolve(credentials).startsWith('/run/credentials/') ||
        dirname(resolve(file)) !== resolve(credentials) ||
        realpathSync(credentials) !== resolve(credentials) ||
        mode !== 0o440 ||
        stat.uid !== 0 ||
        stat.gid !== 0
      )
        throw new Error('PUSH_CONFIGURATION_INVALID');
      const directory = lstatSync(credentials);
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        directory.uid !== 0 ||
        directory.gid !== 0 ||
        (directory.mode & 0o227) !== 0
      )
        throw new Error('PUSH_CONFIGURATION_INVALID');
    }
    return readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}
