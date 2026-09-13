import * as Crypto from 'expo-crypto';
import { supabaseClient } from './client';
import { repositoryError } from './errors';
import { edgeRequest } from './edge-request';
import type { MneloRepository } from '../repository';
import { RepositoryError } from '../repository';
import type { CallDetails } from '@/types/domain';
async function callAction(input: unknown) {
  return await edgeRequest(
    'calls',
    new TextEncoder().encode(JSON.stringify(input)).buffer as ArrayBuffer,
    { 'Content-Type': 'application/json' },
  );
}
export function callsRepository(): Pick<
  MneloRepository,
  'startCall' | 'call' | 'respondCall' | 'callToken' | 'incomingCall' | 'subscribeCalls'
> {
  const client = supabaseClient();
  return {
    async startCall(conversation, media, clientId) {
      const result = await callAction({ action: 'start', conversation, media, clientId });
      if (
        !result ||
        typeof result !== 'object' ||
        !('id' in result) ||
        typeof result.id !== 'string'
      )
        throw new RepositoryError('UNAVAILABLE');
      return result.id;
    },
    async call(id) {
      const { data, error } = await client.rpc('get_call', { call: id });
      if (error) throw repositoryError(error);
      const c = data?.[0];
      if (!c) throw new RepositoryError('FORBIDDEN');
      return {
        id: c.id,
        conversationId: c.conversation_id,
        peerId: c.peer_id,
        peerName: c.peer_name,
        media: c.media as CallDetails['media'],
        status: c.status as CallDetails['status'],
        incoming: c.incoming,
        canJoin: c.can_join,
        createdAt: c.created_at,
        expiresAt: c.expires_at,
        acceptedAt: c.accepted_at,
      };
    },
    async respondCall(call, action) {
      await callAction({ action, call });
    },
    async callToken(call) {
      const result = await callAction({ action: 'token', call });
      if (
        !result ||
        typeof result !== 'object' ||
        !('token' in result) ||
        !('url' in result) ||
        typeof result.token !== 'string' ||
        typeof result.url !== 'string'
      )
        throw new RepositoryError('UNAVAILABLE');
      return { token: result.token, url: result.url };
    },
    async incomingCall() {
      const { data, error } = await client.rpc('incoming_call');
      if (error) throw repositoryError(error);
      return data || null;
    },
    subscribeCalls(userId, listener) {
      const channel = client
        .channel('calls:' + userId + ':' + Crypto.randomUUID(), { config: { private: true } })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'call_sessions',
            filter: 'caller_id=eq.' + userId,
          },
          listener,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'call_sessions',
            filter: 'recipient_id=eq.' + userId,
          },
          listener,
        )
        .subscribe(() => listener());
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
