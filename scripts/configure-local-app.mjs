import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
if (!/^project_id = "mnelo-local"$/m.test(readFileSync(join(root, 'supabase/config.toml'), 'utf8')))
  throw new Error('LOCAL_PROJECT_GUARD');
if (process.env.EXPO_PUBLIC_APP_ENV && process.env.EXPO_PUBLIC_APP_ENV !== 'local')
  throw new Error('LOCAL_ENV_REQUIRED');
const socket = [
  join(homedir(), '.lima/mnelo-local/sock/docker.sock'),
  join(homedir(), '.docker/run/docker.sock'),
  '/var/run/docker.sock',
].find(existsSync);
const env = {
  ...process.env,
  DOCKER_HOST: process.env.DOCKER_HOST ?? (socket ? 'unix://' + socket : ''),
  PATH: join(homedir(), '.local/share/mnelo-toolchain/docker') + ':' + process.env.PATH,
};
if (!env.DOCKER_HOST.startsWith('unix://')) throw new Error('LOCAL_DOCKER_RUNTIME_REQUIRED');
delete env.SUPABASE_ACCESS_TOKEN;
delete env.DOCKER_CONTEXT;
const result = spawnSync(
  join(root, 'node_modules/.bin/supabase'),
  ['status', '-o', 'json', '--network-id', 'mnelo-local-only'],
  { cwd: root, env, encoding: 'utf8' },
);
if (result.status !== 0) throw new Error('LOCAL_BACKEND_UNAVAILABLE');
const status = JSON.parse(result.stdout);
if (
  status.API_URL !== 'http://127.0.0.1:54321' ||
  !status.PUBLISHABLE_KEY?.startsWith('sb_publishable_')
)
  throw new Error('LOCAL_BACKEND_CONFIG_INVALID');
const path = join(root, '.env.local');
const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
const previous = existing
  .match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]
  ?.replace(/^['"]|['"]$/g, '');
if (previous && previous !== status.API_URL) throw new Error('EXISTING_BACKEND_CONFIGURATION');
const keys = {
  EXPO_PUBLIC_APP_ENV: 'local',
  EXPO_PUBLIC_SUPABASE_URL: status.API_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
};
const retained = existing
  .split('\n')
  .filter((line) => !Object.keys(keys).some((key) => line.startsWith(key + '=')))
  .join('\n')
  .trim();
writeFileSync(
  path,
  (retained ? retained + '\n' : '') +
    Object.entries(keys)
      .map(([k, v]) => k + '=' + v)
      .join('\n') +
    '\n',
  { mode: 0o600 },
);
console.log(
  'Local app environment configured. Only the loopback origin and public publishable key were written; values omitted.',
);
