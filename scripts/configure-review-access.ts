import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, lstatSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { homedir } from 'node:os';
import { reviewPhones } from '../src/messenger/review-account';

// Operator-only setup. Never writes credentials to source, stdout or arguments.
process.umask(0o077);
if (process.argv.slice(2).join(' ') !== '--create-owner-review-credentials')
  throw new Error('EXPLICIT_REVIEW_CREDENTIAL_CREATION_REQUIRED');
const directory = join(homedir(), '.config/mnelo/apple-review');
if (!relative(resolve('.'), directory).startsWith('..'))
  throw new Error('REVIEW_CREDENTIALS_MUST_BE_OUTSIDE_REPOSITORY');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const stat = lstatSync(directory);
if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
  throw new Error('REVIEW_CREDENTIAL_DIRECTORY_UNSAFE');
const names = ['access.json', 'private-instructions.json'];
if (names.some((name) => existsSync(join(directory, name))))
  throw new Error('REVIEW_CREDENTIALS_ALREADY_EXIST_PRESERVE_THEM');
const createdAt = Date.now(),
  expiresAt = createdAt + 14 * 86400000;
const accounts = reviewPhones.map((phone) => ({
  phone,
  accessKey: randomBytes(16).toString('hex'),
}));
writeFileSync(
  join(directory, names[0]!),
  JSON.stringify({
    createdAt,
    expiresAt,
    accounts: accounts.map(({ phone, accessKey }) => ({
      phone,
      secretHash: createHash('sha256').update(accessKey).digest('hex'),
    })),
  }) + '\n',
  { flag: 'wx', mode: 0o600 },
);
writeFileSync(
  join(directory, names[1]!),
  JSON.stringify(
    {
      createdAt,
      expiresAt,
      accounts,
      instructions:
        'Build 5 or newer. Choose United States +1, enter a reserved review number, Continue, then paste its 32-character access key in Review access key. No SMS is sent. On two devices use separate accounts. Add the other review number, compare identity codes, enable notifications, then test chats/media/groups/calls/background/reconnect. These accounts cannot contact the real tester cohort. Keep each installation; a different device cannot silently replace its pinned identity. Contact the developer if a review-only reset is needed.',
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx', mode: 0o600 },
);
process.stdout.write(
  'REVIEW_CREDENTIAL_FILES_CREATED: two reserved accounts, 14-day expiry, owner-private files outside source. No deployment or SMS.\n',
);
