import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
if (
  !/^project_id = "mnelo-local"$/m.test(readFileSync(join(root, 'supabase/config.toml'), 'utf8')) ||
  (process.env.EXPO_PUBLIC_APP_ENV && process.env.EXPO_PUBLIC_APP_ENV !== 'local')
)
  throw new Error('LOCAL_PROJECT_GUARD');
const socket = [
  join(homedir(), '.lima/mnelo-local/sock/docker.sock'),
  join(homedir(), '.docker/run/docker.sock'),
  '/var/run/docker.sock',
].find(existsSync);
const host = process.env.DOCKER_HOST ?? (socket ? 'unix://' + socket : '');
if (!host.startsWith('unix://') || !existsSync(host.slice(7)))
  throw new Error('LOCAL_DOCKER_GUARD');
const bundledDocker = join(homedir(), '.local/share/mnelo-toolchain/docker/docker');
const docker = existsSync(bundledDocker) ? bundledDocker : 'docker';
const run = (args) =>
  execFileSync(docker, ['--host', host, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const operation = process.argv[2];
if (!['start', 'stop'].includes(operation)) throw new Error('Use start or stop');
if (operation === 'stop') {
  run(['stop', 'mnelo-livekit']);
  console.log('Local LiveKit stopped.');
  process.exit(0);
}
const directory = join(root, 'artifacts/local-livekit');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const envPath = join(directory, '.env.local');
if (!existsSync(envPath)) {
  const key = 'mnelo_local_' + randomBytes(8).toString('hex'),
    secret = randomBytes(32).toString('hex');
  writeFileSync(
    envPath,
    `MNELO_SERVER_ENV=local\nLIVEKIT_URL=http://mnelo-livekit:7880\nLIVEKIT_PUBLIC_URL=ws://127.0.0.1:7880\nLIVEKIT_API_KEY=${key}\nLIVEKIT_API_SECRET=${secret}\nLIVEKIT_DEPLOYMENT=self-hosted-no-auto-create\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(directory, 'server.yaml'),
    `port: 7880\nbind_addresses: ["0.0.0.0"]\nkeys:\n  ${key}: ${secret}\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  use_external_ip: false\n  node_ip: 127.0.0.1\n  stun_servers: []\nroom:\n  auto_create: false\n  empty_timeout: 120\n  departure_timeout: 20\n  max_participants: 2\nlogging:\n  level: warn\n`,
    { mode: 0o600 },
  );
}
let exists = false;
try {
  run(['container', 'inspect', 'mnelo-livekit']);
  exists = true;
} catch {}
if (exists) run(['start', 'mnelo-livekit']);
else
  run([
    'run',
    '-d',
    '--name',
    'mnelo-livekit',
    '--network',
    'mnelo-local-only',
    '--restart',
    'unless-stopped',
    '-p',
    '127.0.0.1:7880:7880',
    '-p',
    '127.0.0.1:7881:7881',
    '-v',
    join(directory, 'server.yaml') + ':/etc/livekit.yaml:ro',
    'livekit/livekit-server:v1.13.6@sha256:e37d68f172556d02aa77968b9fc55ef481468c0315fa38e4fa6c56ce72e3a815',
    '--config',
    '/etc/livekit.yaml',
  ]);
console.log(
  'Local LiveKit started with loopback signaling/RTC TCP ports and automatic room creation disabled. Server credentials remain in ignored owner-only files.',
);
