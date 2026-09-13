import * as Crypto from 'expo-crypto';
import { supabaseClient } from './client';
import type { MneloRepository } from '../repository';
import { repositoryError } from './errors';
import { decodeCursor } from '@/features/chats/cursor';
export function moderationRepository(): Pick<
  MneloRepository,
  'block' | 'unblock' | 'blockedProfiles' | 'report'
> {
  const client = supabaseClient();
  return {
    async block(target) {
      const { error } = await client.rpc('block_user', { target });
      if (error) throw repositoryError(error);
    },
    async unblock(target) {
      const { error } = await client.rpc('unblock_user', { target });
      if (error) throw repositoryError(error);
    },
    async blockedProfiles(cursor) {
      const { data, error } = await client.rpc('list_blocked_profiles', decodeCursor(cursor));
      if (error) throw repositoryError(error);
      return (data ?? []).map((p) => ({
        id: p.id,
        userId: p.user_id,
        displayName: p.display_name,
        username: p.username,
        createdAt: p.created_at,
      }));
    },
    async report(target, reason, detail, options) {
      const { error } = await client.rpc('submit_report', {
        target,
        reason: reason === 'fraud' ? 'scam' : reason === 'impersonation' ? 'fake' : reason,
        detail,
        client_id: options?.clientId ?? Crypto.randomUUID(),
        ...(options?.messageId ? { message: options.messageId } : {}),
      });
      if (error) throw repositoryError(error);
    },
  };
}
