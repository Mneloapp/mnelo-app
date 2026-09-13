import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Deliberately no arbitrary flags, remote URL, linked project or production target.
const operation = process.argv[2];
const commands = {
  start: ['start'],
  stop: ['stop'],
  reset: ['db', 'reset', '--local', '--yes'],
  migrate: ['migration', 'up', '--local'],
  functions: ['functions', 'serve'],
  test: ['test', 'db', '--local'],
  lint: ['db', 'lint', '--local', '--schema', 'public,private', '--fail-on', 'warning'],
  types: ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
};
if (!Object.hasOwn(commands, operation))
  throw new Error('Use start, stop, reset, migrate, functions, test, lint or types.');
const root = resolve(import.meta.dirname, '..');
const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
if (!/^project_id = "mnelo-local"$/m.test(config)) throw new Error('LOCAL_PROJECT_GUARD');
if (process.env.EXPO_PUBLIC_APP_ENV && process.env.EXPO_PUBLIC_APP_ENV !== 'local')
  throw new Error('LOCAL_ENV_REQUIRED');
const localDocker = join(homedir(), '.local/share/mnelo-toolchain/docker');
const localSocket = [
  join(homedir(), '.lima/mnelo-local/sock/docker.sock'),
  join(homedir(), '.docker/run/docker.sock'),
  '/var/run/docker.sock',
].find(existsSync);
const env = { ...process.env };
// Tokens are unnecessary for local operations and must never be inherited by mistake.
delete env.SUPABASE_ACCESS_TOKEN;
delete env.SUPABASE_DB_PASSWORD;
delete env.DOCKER_CONTEXT;
if (!env.DOCKER_HOST && localSocket) env.DOCKER_HOST = 'unix://' + localSocket;
if (!env.DOCKER_HOST) throw new Error('LOCAL_DOCKER_RUNTIME_REQUIRED');
if (env.DOCKER_HOST && !env.DOCKER_HOST.startsWith('unix://'))
  throw new Error('LOCAL_DOCKER_SOCKET_REQUIRED');
if (existsSync(localDocker)) env.PATH = localDocker + ':' + env.PATH;
if (operation === 'start') {
  const check = spawnSync('docker', ['network', 'inspect', 'mnelo-local-only'], {
    env,
    stdio: 'ignore',
  });
  if (check.status !== 0) {
    const create = spawnSync(
      'docker',
      [
        'network',
        'create',
        '-o',
        'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
        'mnelo-local-only',
      ],
      { env, stdio: 'ignore' },
    );
    if (create.status !== 0) throw new Error('LOCAL_DOCKER_NETWORK_FAILED');
  }
}
if (operation === 'functions') {
  const localCallEnv = join(root, 'artifacts/local-livekit/.env.local');
  if (existsSync(localCallEnv)) commands.functions.push('--env-file', localCallEnv);
}
const result = spawnSync(
  join(root, 'node_modules/.bin/supabase'),
  [...commands[operation], '--network-id', 'mnelo-local-only'],
  {
    cwd: root,
    env,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
