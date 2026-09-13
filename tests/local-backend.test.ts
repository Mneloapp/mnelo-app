import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const script = resolve('scripts/local-backend.mjs');
it('refuses local database reset while a nonlocal application environment is selected', () => {
  const result = spawnSync(process.execPath, [script, 'reset'], {
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: 'production' },
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('LOCAL_ENV_REQUIRED');
});
it('rejects a remote Docker endpoint before a local reset can reach it', () => {
  const result = spawnSync(process.execPath, [script, 'reset'], {
    env: {
      ...process.env,
      EXPO_PUBLIC_APP_ENV: 'local',
      DOCKER_HOST: 'tcp://untrusted.invalid:2376',
    },
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('LOCAL_DOCKER_SOCKET_REQUIRED');
});
it('does not provide a linked/cloud command path', () => {
  const result = spawnSync(process.execPath, [script, 'push', '--linked'], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    'Use start, stop, reset, migrate, functions, test, lint or types',
  );
});
