import { z } from 'zod';

const optionalValue = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

const schema = z
  .object({
    appEnv: z.preprocess(
      (value) => (value === undefined || value === '' ? 'local' : value),
      z.enum(['local', 'development', 'preview', 'production']),
    ),
    supabaseUrl: optionalValue,
    supabasePublishableKey: optionalValue,
    livekitUrl: optionalValue,
  })
  .superRefine((value, context) => {
    const issue = (path: string) =>
      context.addIssue({ code: 'custom', path: [path], message: 'Invalid configuration' });
    const local = value.appEnv === 'local';
    const release = value.appEnv === 'preview' || value.appEnv === 'production';
    if (Boolean(value.supabaseUrl) !== Boolean(value.supabasePublishableKey)) issue('supabaseUrl');
    if (release && !value.supabaseUrl) issue('supabaseUrl');
    if (
      value.supabasePublishableKey &&
      !/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value.supabasePublishableKey)
    )
      issue('supabasePublishableKey');
    for (const field of ['supabaseUrl', 'livekitUrl'] as const) {
      const raw = value[field];
      if (!raw) continue;
      try {
        const url = new URL(raw);
        const secureProtocol = field === 'supabaseUrl' ? 'https:' : 'wss:';
        const localProtocol = field === 'supabaseUrl' ? 'http:' : 'ws:';
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
          issue(field);
        if (
          url.protocol !== secureProtocol &&
          !(local && loopback && url.protocol === localProtocol)
        )
          issue(field);
        if (!local && loopback) issue(field);
      } catch {
        issue(field);
      }
    }
  });

export type AppEnvironment = z.infer<typeof schema>;

export function parseEnvironment(input: {
  appEnv?: string | undefined;
  supabaseUrl?: string | undefined;
  supabasePublishableKey?: string | undefined;
  livekitUrl?: string | undefined;
}): AppEnvironment {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    // Only field names leave validation; never echo supplied keys or URLs.
    throw new Error(
      `CONFIG_INVALID: Check ${fields.join(', ')}. See .env.example and docs/SECURITY.md.`,
    );
  }
  return Object.freeze(parsed.data);
}
