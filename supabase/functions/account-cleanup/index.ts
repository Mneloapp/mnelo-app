import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import {
  processAccountDeletion,
  type DeletionJob,
  type DeletionObject,
} from '../_shared/deletion.ts';
import { response } from '../_shared/http.ts';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return response('INVALID', 405);
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    url = Deno.env.get('SUPABASE_URL'),
    header = request.headers.get('Authorization');
  if (!secret || !url || !header || header.length > 4096) return response('UNAUTHORIZED', 401);
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [expected, actual] = await Promise.all([digest('Bearer ' + secret), digest(header)]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i]! ^ actual[i]!;
  if (difference) return response('UNAUTHORIZED', 401);
  try {
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    });
    const args = (job: DeletionJob) => ({ job: job.id, lease: job.lease });
    const rpc = async (name: string, input?: Record<string, unknown>) => {
      const result = await admin.rpc(name, input);
      if (result.error) throw new Error('DELETION_QUEUE');
      return result.data;
    };
    // Retention failure must not prevent a different account's queued deletion.
    const retention = (async () => {
      const late = (await rpc('deletion_retention_objects')) as {
        bucket: 'avatars' | 'chat-media';
        object_path: string;
      }[];
      for (const bucket of ['avatars', 'chat-media'] as const) {
        const paths = late.filter((item) => item.bucket === bucket).map((item) => item.object_path);
        if (paths.length) {
          const removed = await admin.storage.from(bucket).remove(paths);
          if (removed.error) throw new Error('DELETION_STORAGE');
        }
      }
      await rpc('purge_deletion_receipts');
    })();
    const deletion = processAccountDeletion(
      {
        claim: async () =>
          ((await rpc('claim_account_deletion'))?.[0] as DeletionJob | undefined) ?? null,
        prepare: async (job) => Boolean(await rpc('prepare_account_deletion', args(job))),
        objects: async (job) => (await rpc('deletion_objects', args(job))) as DeletionObject[],
        removed: async (job, objects) => {
          await rpc('mark_deletion_objects', { ...args(job), objects });
        },
        ready: async (job) => Boolean(await rpc('account_deletion_ready', args(job))),
        defer: async (job) => {
          await rpc('defer_account_deletion', args(job));
        },
        finish: async (job, completed) => {
          await rpc('finish_account_deletion', { ...args(job), completed });
        },
      },
      {
        async remove(bucket, paths) {
          const result = await admin.storage.from(bucket).remove(paths);
          if (result.error) throw new Error('DELETION_STORAGE');
        },
      },
      {
        async remove(actor) {
          const result = await admin.auth.admin.deleteUser(actor);
          if (!result.error) return 'deleted';
          if (result.error.status === 404 && result.error.code === 'user_not_found')
            return 'missing';
          // Auth wraps transactional errors such as PostgreSQL 40P01 in an HTTP 500.
          // Repeating deletion is idempotent; bounded retries cover uncertain acknowledgments.
          return !result.error.status || result.error.status >= 500 || result.error.status === 429
            ? 'retry'
            : 'failed';
        },
      },
    );
    const results = await Promise.allSettled([retention, deletion]);
    if (results.some((result) => result.status === 'rejected'))
      return response('RETRY_REQUIRED', 503);
    const result = results[1];
    return Response.json({ status: result.status === 'fulfilled' ? result.value : 'processing' });
  } catch {
    return response('RETRY_REQUIRED', 503);
  }
});
