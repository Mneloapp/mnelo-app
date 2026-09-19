import { fallbackAvatarColor } from '@/messenger/avatar-color';

test('each peer keeps its color across cold starts and shuffled chat/call rendering', () => {
  const ids = Array.from({ length: 40 }, (_, index) => `peer:fixture-${index}`);
  const colors = new Map(ids.map((id) => [id, fallbackAvatarColor(id)]));
  jest.resetModules();
  const fresh = jest.requireActual<typeof import('@/messenger/avatar-color')>(
    '@/messenger/avatar-color',
  );
  for (const id of ids.reverse()) expect(fresh.fallbackAvatarColor(id)).toBe(colors.get(id));
  expect(new Set(colors.values()).size).toBe(40);
  expect(fresh.fallbackAvatarColor('group:fixture-1')).not.toBe(colors.get('peer:fixture-1'));
});
