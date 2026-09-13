import { supabaseClient } from './client';
import { env } from '@/lib/env';
import { RepositoryError } from '../repository';
export async function edgeRequest(
  path: string,
  body: ArrayBuffer,
  headers: Record<string, string>,
) {
  const { data, error } = await supabaseClient().auth.getSession();
  if (error || !data.session || !env.supabaseUrl || !env.supabasePublishableKey)
    throw new RepositoryError('UNAUTHORIZED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const result = await fetch(env.supabaseUrl + '/functions/v1/' + path, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...headers,
        apikey: env.supabasePublishableKey,
        Authorization: 'Bearer ' + data.session.access_token,
      },
      body,
    });
    if (!result.ok) {
      throw new RepositoryError(
        result.status === 401
          ? 'UNAUTHORIZED'
          : result.status === 403
            ? 'FORBIDDEN'
            : result.status === 409
              ? 'CONFLICT'
              : result.status === 429
                ? 'RATE_LIMITED'
                : [400, 413, 415].includes(result.status)
                  ? 'INVALID'
                  : 'UNAVAILABLE',
      );
    }
    return (await result.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
