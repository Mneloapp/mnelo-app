import { notificationId } from '../src/features/notifications/payload';
it('accepts only an opaque notification identifier, never a supplied route or external URL', () => {
  for (const value of [
    null,
    'mnelo://chat/anything',
    { url: 'https://evil.example' },
    { notificationId: '../account' },
    { notificationId: 42 },
    { notificationId: 'mnelo://account' },
  ])
    expect(notificationId(value)).toBeNull();
  expect(
    notificationId({
      notificationId: '57dd6468-0e5d-4491-9cc7-c2e6a83f5c9e',
      url: 'https://ignored.example',
    }),
  ).toBe('57dd6468-0e5d-4491-9cc7-c2e6a83f5c9e');
});
