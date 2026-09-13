import { RepositoryError, type MneloRepository } from '@/services/repository';

export async function loadRecentPeople(
  source: Pick<MneloRepository, 'conversations' | 'profile'>,
  userId: string,
) {
  // The inbox is cursor-paginated and ordered by last activity. Read only its first
  // page and at most six peers; never search/enumerate profiles to fill this section.
  const conversations = await source.conversations();
  const peers = new Set<string>();
  for (const conversation of conversations) {
    if (
      conversation.kind !== 'direct' ||
      !conversation.title.trim() ||
      !conversation.memberIds.includes(userId)
    )
      continue;
    const peer = conversation.memberIds.find((id) => id !== userId);
    if (peer) peers.add(peer);
    if (peers.size === 6) break;
  }
  const profiles = await Promise.all(
    [...peers].map(async (id) => {
      try {
        return await source.profile(id);
      } catch (error) {
        // A peer can block/delete between the inbox snapshot and this authorized read.
        if (error instanceof RepositoryError && error.code === 'FORBIDDEN') return null;
        throw error;
      }
    }),
  );
  return profiles.filter((profile) => profile !== null);
}
