import * as Crypto from 'expo-crypto';
import { supabaseClient } from './client';
import { RepositoryError, type MneloRepository } from '../repository';
import { repositoryError } from './errors';
import type { ConnectionRequest } from '@/types/domain';
import type { Database } from './database.types';
import { decodeCursor } from '@/features/chats/cursor';
function mapRequest(
  row: Database['public']['Tables']['connection_requests']['Row'],
): ConnectionRequest {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    context: row.context,
    message: row.message,
    status: row.status as ConnectionRequest['status'],
    createdAt: row.created_at,
  };
}
export function connectionsRepository(): Pick<
  MneloRepository,
  'relationship' | 'openDirectConversation' | 'requestConnection' | 'requests' | 'respondRequest'
> {
  const client = supabaseClient();
  return {
    async relationship(target, matchingRequestId) {
      const { data, error } = await client.rpc('connection_state', {
        target,
        ...(matchingRequestId ? { matching_request: matchingRequestId } : {}),
      });
      if (error) throw repositoryError(error);
      const row = data?.[0];
      if (!row) throw new RepositoryError('FORBIDDEN');
      return {
        connected: row.connected,
        conversationId: row.conversation_id || null,
        pendingRequestId: row.pending_request_id || null,
        incoming: row.incoming,
        canRequest: row.can_request,
        context: row.context || null,
      };
    },
    async openDirectConversation(target) {
      const { data, error } = await client.rpc('direct_conversation', { target });
      if (error) throw repositoryError(error);
      if (!data) throw new RepositoryError('FORBIDDEN');
      return data;
    },
    async requestConnection(recipientId, context, message, options) {
      const { data, error } = await client.rpc('send_connection_request', {
        target: recipientId,
        context,
        message,
        client_id: options?.clientId ?? Crypto.randomUUID(),
        ...(options?.matchingRequestId ? { matching_request: options.matchingRequestId } : {}),
      });
      if (error) throw repositoryError(error);
      const row = await client.from('connection_requests').select('*').eq('id', data).single();
      if (row.error) throw repositoryError(row.error);
      return mapRequest(row.data);
    },
    async requests(cursor) {
      const { data, error } = await client.rpc('list_connection_requests', decodeCursor(cursor));
      if (error) throw repositoryError(error);
      return (data ?? []).map(mapRequest);
    },
    async respondRequest(request, action) {
      const { data, error } = await client.rpc('respond_connection_request', { request, action });
      if (error) throw repositoryError(error);
      return data || null;
    },
  };
}
