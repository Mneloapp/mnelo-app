import { supabaseClient } from './client';
import { RepositoryError, type MneloRepository } from '../repository';
import { repositoryError } from './errors';
import type { ConnectionDetails, Review, Verification } from '@/types/domain';
import type { Database } from './database.types';
import { decodeCursor } from '@/features/chats/cursor';
function mapConnection(
  row: Database['public']['Functions']['connection_details']['Returns'][number],
): ConnectionDetails {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    peerId: row.peer_id,
    displayName: row.display_name,
    username: row.username,
    context: row.context,
    purpose: row.interaction_type as ConnectionDetails['purpose'],
    completedAt: row.completed_at || null,
    confirmedByMe: row.confirmed_by_me,
    confirmedByPeer: row.confirmed_by_peer,
    review: row.review_id ? { id: row.review_id, rating: row.rating, comment: row.comment } : null,
  };
}
export function reputationRepository(): Pick<
  MneloRepository,
  | 'connectionDetails'
  | 'completedConnections'
  | 'confirmCompletion'
  | 'submitReview'
  | 'reviews'
  | 'verifications'
> {
  const client = supabaseClient();
  return {
    async connectionDetails(conversation) {
      const { data, error } = await client.rpc('connection_details', { conversation });
      if (error) throw repositoryError(error);
      if (!data?.[0]) throw new RepositoryError('FORBIDDEN');
      return mapConnection(data[0]);
    },
    async completedConnections(cursor) {
      const { data, error } = await client.rpc('completed_connections', decodeCursor(cursor));
      if (error) throw repositoryError(error);
      return (data ?? []).map(mapConnection);
    },
    async confirmCompletion(connection) {
      const { error } = await client.rpc('confirm_connection_completion', { connection });
      if (error) throw repositoryError(error);
    },
    async submitReview(connection, rating, comment) {
      const { data, error } = await client.rpc('submit_connection_review', {
        connection,
        rating,
        comment,
      });
      if (error) throw repositoryError(error);
      return data;
    },
    async reviews(target, cursor) {
      const { data, error } = await client.rpc('profile_reviews', {
        target,
        ...decodeCursor(cursor),
      });
      if (error) throw repositoryError(error);
      return (data ?? []).map((r): Review => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        purpose: r.interaction_type as Review['purpose'],
        own: r.own,
      }));
    },
    async verifications(target) {
      const { data, error } = await client.rpc('profile_verifications', { target });
      if (error) throw repositoryError(error);
      return (data ?? []).map((v): Verification => ({
        type: v.verification_type as Verification['type'],
        verifiedAt: v.verified_at,
        expiresAt: v.expires_at || null,
      }));
    },
  };
}
