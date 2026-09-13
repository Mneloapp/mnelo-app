import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { supabaseClient, sessionStorage, sessionStorageKey } from './client';
import { RepositoryError, type MneloRepository } from '../repository';
import { repositoryError } from './errors';
import { env } from '@/lib/env';
import { createBoundedFetch } from '@/lib/bounded-fetch';
const key = sessionStorageKey + '.deletion';
const receiptSchema = z.object({
  version: z.literal(1),
  receipt: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.string().datetime(),
});
const statusSchema = z.object({ status: z.enum(['processing', 'deleted', 'not_found']) });
const transport = createBoundedFetch(fetch, 20000);
async function storedReceipt() {
  const raw = await sessionStorage.getItem(key);
  if (!raw) return null;
  const parsed = receiptSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new RepositoryError('UNAVAILABLE');
  return parsed.data;
}
async function call(action: 'request' | 'status', receipt: string) {
  if (!env.supabaseUrl || !env.supabasePublishableKey) throw new RepositoryError('UNAVAILABLE');
  const headers: Record<string, string> = {
    apikey: env.supabasePublishableKey,
    'Content-Type': 'application/json',
  };
  if (action === 'request') {
    const { data, error } = await supabaseClient().auth.getSession();
    if (error) throw repositoryError(error);
    if (!data.session) throw new RepositoryError('UNAUTHORIZED');
    headers.Authorization = 'Bearer ' + data.session.access_token;
  }
  let result: Response;
  try {
    result = await transport(env.supabaseUrl + '/functions/v1/account-deletion', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, receipt }),
    });
  } catch {
    throw new RepositoryError('UNAVAILABLE');
  }
  if (!result.ok)
    throw new RepositoryError(
      result.status === 401
        ? 'UNAUTHORIZED'
        : result.status === 429
          ? 'RATE_LIMITED'
          : result.status === 403
            ? 'FORBIDDEN'
            : 'UNAVAILABLE',
    );
  const parsed = statusSchema.safeParse(await result.json());
  if (!parsed.success) throw new RepositoryError('UNAVAILABLE');
  return parsed.data.status;
}
export function accountRepository(): Pick<
  MneloRepository,
  | 'requestAccountDeletion'
  | 'pendingAccountDeletion'
  | 'accountDeletionStatus'
  | 'clearAccountDeletionReceipt'
> {
  return {
    async pendingAccountDeletion() {
      return Boolean(await storedReceipt());
    },
    async accountDeletionStatus() {
      const saved = await storedReceipt();
      if (!saved) return 'not_found';
      return call('status', saved.receipt);
    },
    async requestAccountDeletion() {
      let saved = await storedReceipt();
      if (!saved) {
        saved = {
          version: 1,
          receipt: Array.from(await Crypto.getRandomBytesAsync(32))
            .map((n) => n.toString(16).padStart(2, '0'))
            .join(''),
          createdAt: new Date().toISOString(),
        };
        await sessionStorage.setItem(key, JSON.stringify(saved));
      }
      const status = await call('status', saved.receipt);
      if (status === 'deleted') return { status: 'deleted' };
      if (status === 'processing') return { status: 'requested' };
      await call('request', saved.receipt);
      return { status: 'requested' };
    },
    async clearAccountDeletionReceipt() {
      const saved = await storedReceipt();
      if (!saved) return;
      const status = await call('status', saved.receipt);
      if (
        status === 'processing' ||
        (status === 'not_found' && Date.now() - Date.parse(saved.createdAt) < 120000)
      )
        throw new RepositoryError('CONFLICT');
      await sessionStorage.removeItem(key);
    },
  };
}
