import { loadRecentPeople } from '@/features/chats/recent-people';
import { RepositoryError } from '@/services/repository';
import type { Conversation, Profile } from '@/types/domain';
const conversation = (peer: string, extra: Partial<Conversation> = {}): Conversation => ({
  id: peer,
  kind: 'direct',
  title: peer,
  memberIds: ['me', peer],
  preview: '',
  updatedAt: '2026-09-09T00:00:00Z',
  unreadCount: 0,
  ...extra,
});
const profile = (id: string): Profile => ({
  id,
  displayName: id,
  username: id,
  bio: '',
  area: '',
  capabilities: [],
  languages: [],
  avatarPath: null,
  availableToday: false,
  verified: false,
  reviewCount: 0,
  averageRating: null,
});
test('recent people follow authorized inbox order, exclude groups/deleted accounts and bound reads', async () => {
  const source = {
    conversations: jest.fn(async () => [
      conversation('group', { kind: 'group' }),
      conversation('deleted', { title: '' }),
      conversation('unrelated', { memberIds: ['someone', 'else'] }),
      conversation('first'),
      conversation('first'),
      ...Array.from({ length: 12 }, (_, i) => conversation('peer' + i)),
    ]),
    profile: jest.fn(async (id: string) => profile(id)),
  };
  const result = await loadRecentPeople(source, 'me');
  expect(result.map((p) => p.id)).toEqual(['first', 'peer0', 'peer1', 'peer2', 'peer3', 'peer4']);
  expect(source.conversations).toHaveBeenCalledTimes(1);
  expect(source.conversations).toHaveBeenCalledWith();
  expect(source.profile).toHaveBeenCalledTimes(6);
});
test('a peer losing access is omitted without inventing a profile', async () => {
  const source = {
    conversations: async () => [conversation('blocked'), conversation('allowed')],
    profile: async (id: string) => {
      if (id === 'blocked') throw new RepositoryError('FORBIDDEN');
      return profile(id);
    },
  };
  expect((await loadRecentPeople(source, 'me')).map((p) => p.id)).toEqual(['allowed']);
});
test('network failures remain recoverable errors instead of a misleading empty state', async () => {
  const source = {
    conversations: async () => [conversation('peer')],
    profile: async (): Promise<Profile> => {
      throw new RepositoryError('UNAVAILABLE');
    },
  };
  await expect(loadRecentPeople(source, 'me')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
});
