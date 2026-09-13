import { validateReleaseEnvironment } from '../config/release-environment';
import { parseEnvironment } from '@/lib/env-schema';

const id = '96698693-29a0-491a-a667-d0337d4a79d5';
const unregistered = { development: null, preview: null, production: null };
const registry = {
  development: { supabaseOrigin: 'https://development.example.com', easProjectId: id },
  preview: { supabaseOrigin: 'https://preview.example.com', easProjectId: id },
  production: { supabaseOrigin: 'https://production.example.com', easProjectId: id },
};
const key = `sb_publishable_${'a'.repeat(32)}`;
const release = (url = registry.production.supabaseOrigin) =>
  parseEnvironment({
    appEnv: 'production',
    supabaseUrl: url,
    supabasePublishableKey: key,
  });
it('allows local work and an unconfigured development client before account setup', () => {
  expect(() =>
    validateReleaseEnvironment(parseEnvironment({}), undefined, unregistered),
  ).not.toThrow();
  expect(() =>
    validateReleaseEnvironment(
      parseEnvironment({ appEnv: 'development' }),
      undefined,
      unregistered,
    ),
  ).not.toThrow();
});
it('refuses a release whose environment has never been registered', () => {
  expect(() => validateReleaseEnvironment(release(), id, unregistered)).toThrow(
    'RELEASE_ENVIRONMENT_NOT_REGISTERED',
  );
});
it('rejects a development origin accidentally supplied to production', () => {
  expect(() =>
    validateReleaseEnvironment(release(registry.development.supabaseOrigin), id, registry),
  ).toThrow('RELEASE_PROJECT_MISMATCH');
});
it('rejects missing or different EAS projects', () => {
  expect(() => validateReleaseEnvironment(release(), undefined, registry)).toThrow(
    'RELEASE_PROJECT_MISMATCH',
  );
  expect(() =>
    validateReleaseEnvironment(release(), '9849dca6-d7b4-457d-b63b-2e59e6f53061', registry),
  ).toThrow('RELEASE_PROJECT_MISMATCH');
});
it('rejects shared backends even when the selected production origin matches', () => {
  expect(() =>
    validateReleaseEnvironment(release(), id, { ...registry, preview: registry.production }),
  ).toThrow('RELEASE_BACKENDS_NOT_ISOLATED');
});
it('accepts the reviewed origin/project without including keys in the registry', () => {
  expect(() => validateReleaseEnvironment(release(), id, registry)).not.toThrow();
});
it('rejects credential-bearing registry URLs with redacted errors', () => {
  expect(() =>
    validateReleaseEnvironment(release(), id, {
      ...registry,
      production: { ...registry.production, supabaseOrigin: 'https://user:private@example.com' },
    }),
  ).toThrow('RELEASE_REGISTRY_INVALID');
});
