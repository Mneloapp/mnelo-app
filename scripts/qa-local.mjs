import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Runs only against the guarded local integration context. Never resets data or targets cloud.
const root = resolve(import.meta.dirname, '..');
if (
  !/^project_id = "mnelo-local"$/m.test(readFileSync(join(root, 'supabase/config.toml'), 'utf8')) ||
  (process.env.EXPO_PUBLIC_APP_ENV && process.env.EXPO_PUBLIC_APP_ENV !== 'local')
)
  throw new Error('LOCAL_QA_GUARD');
const directory = join(root, 'artifacts/local-qa');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const names = [
  'auth',
  'profiles',
  'messaging',
  'media',
  'groups',
  'connect',
  'matching',
  'connections',
  'reputation',
  'privacy',
  'moderation',
  'notifications',
  'calls',
  'devices',
  'account',
  'security',
  'offline',
  'performance',
  'localization',
];
const results = [];
for (const name of names) {
  const start = Date.now();
  const result = spawnSync('npm', ['run', `test:${name}`], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: 'local', FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(join(directory, `${name}.log`), output, { mode: 0o600 });
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '');
  const pass = Number(/(?:ℹ |# )pass (\d+)/.exec(clean)?.[1] ?? 0);
  const fail = Number(/(?:ℹ |# )fail (\d+)/.exec(clean)?.[1] ?? 0);
  const status = result.status === 0 && pass > 0 && fail === 0 ? 'PASS' : 'FAIL';
  const item = {
    name,
    status,
    exitCode: result.status,
    signal: result.signal,
    passed: pass,
    failed: fail,
    elapsedMs: Date.now() - start,
    ...(result.error ? { runnerError: result.error.code ?? 'RUNNER_ERROR' } : {}),
  };
  results.push(item);
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(results, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(`${name}: ${status}; passed=${pass}; failed=${fail}; elapsedMs=${item.elapsedMs}`);
}
process.exitCode = results.every((r) => r.status === 'PASS') ? 0 : 1;
