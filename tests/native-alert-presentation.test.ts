import { AppState } from 'react-native';
import '@/messenger/device-alerts.native';
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
const handler = jest.requireMock('expo-notifications').setNotificationHandler.mock.calls[0][0];
test('OS foreground banners are suppressed including inactive transition and delayed local payloads', async () => {
  for (const state of ['active', 'inactive']) {
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
    for (const data of [{ mnelo: { kind: 'message' } }, { kind: 'message' }, {}]) {
      const result = await handler.handleNotification({ request: { content: { data } } });
      expect(result.shouldShowBanner).toBe(false);
      expect(result.shouldPlaySound).toBe(false);
    }
  }
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
  expect((await handler.handleNotification({})).shouldShowBanner).toBe(true);
});
