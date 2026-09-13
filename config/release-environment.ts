import { z } from 'zod';
import type { AppEnvironment } from '../src/lib/env-schema';

const registration = z
  .object({
    supabaseOrigin: z.url(),
    easProjectId: z.uuid(),
  })
  .strict()
  .nullable();
const schema = z
  .object({ development: registration, preview: registration, production: registration })
  .strict();

/** Build-only public project registry; never stores or exports credentials. */
export function validateReleaseEnvironment(
  environment: AppEnvironment,
  projectId: string | undefined,
  input: unknown,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error('RELEASE_REGISTRY_INVALID');
  const origins = Object.values(parsed.data)
    .filter((entry) => entry !== null)
    .map((entry) => {
      const url = new URL(entry.supabaseOrigin);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error('RELEASE_REGISTRY_INVALID');
      return url.origin;
    });
  if (new Set(origins).size !== origins.length) throw new Error('RELEASE_BACKENDS_NOT_ISOLATED');
  if (environment.appEnv === 'local') return;
  // An unconfigured Development Client can be built before backend authorization.
  if (environment.appEnv === 'development' && !environment.supabaseUrl) return;
  const registered = parsed.data[environment.appEnv];
  if (!registered) throw new Error('RELEASE_ENVIRONMENT_NOT_REGISTERED');
  if (
    !environment.supabaseUrl ||
    new URL(environment.supabaseUrl).origin !== new URL(registered.supabaseOrigin).origin ||
    projectId !== registered.easProjectId
  )
    throw new Error('RELEASE_PROJECT_MISMATCH');
}
