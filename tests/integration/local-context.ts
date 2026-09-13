import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
export function localContext() {
  const config = readFileSync(resolve('supabase/config.toml'), 'utf8');
  if (
    !/^project_id = "mnelo-local"$/m.test(config) ||
    (process.env.EXPO_PUBLIC_APP_ENV && process.env.EXPO_PUBLIC_APP_ENV !== 'local')
  )
    throw new Error('LOCAL_INTEGRATION_GUARD');
  const localSocket = [
    join(homedir(), '.lima/mnelo-local/sock/docker.sock'),
    join(homedir(), '.docker/run/docker.sock'),
    '/var/run/docker.sock',
  ].find(existsSync);
  const socket = localSocket ? 'unix://' + localSocket : '';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DOCKER_HOST: process.env.DOCKER_HOST ?? socket,
    PATH: join(homedir(), '.local/share/mnelo-toolchain/docker') + ':' + process.env.PATH,
  };
  if (!env.DOCKER_HOST?.startsWith('unix://')) throw new Error('LOCAL_INTEGRATION_GUARD');
  delete env.DOCKER_CONTEXT;
  delete env.SUPABASE_ACCESS_TOKEN;
  const raw = execFileSync(
    'node_modules/.bin/supabase',
    ['status', '-o', 'json', '--network-id', 'mnelo-local-only'],
    { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const status: Record<string, string> = JSON.parse(raw);
  if (
    status.API_URL !== 'http://127.0.0.1:54321' ||
    !status.PUBLISHABLE_KEY?.startsWith('sb_publishable_') ||
    !status.SERVICE_ROLE_KEY
  )
    throw new Error('LOCAL_INTEGRATION_GUARD');
  const url = status.API_URL,
    key = status.PUBLISHABLE_KEY;
  // Privileged context is confined to local test setup; never imported by the mobile application.
  const admin = createClient(url, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { url, key, admin, env };
}
