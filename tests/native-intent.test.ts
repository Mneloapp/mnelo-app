import { Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import * as installedLinking from 'expo-router/build/link/linking';
import { getLinkingConfig } from 'expo-router/build/getLinkingConfig';
import type { RouteNode } from 'expo-router/build/Route';
import { redirectSystemPath } from '../app/+native-intent';

const malformed = 'mnelo://chat/not-authorized?query=' + '%C0'.repeat(2048);
const route: RouteNode = {
  type: 'layout',
  route: '',
  contextKey: './_layout.tsx',
  dynamic: null,
  loadRoute: () => ({}),
  children: [
    {
      type: 'route',
      route: 'index',
      contextKey: './index.tsx',
      dynamic: null,
      loadRoute: () => ({}),
      children: [],
    },
  ],
};
const context = Object.assign(() => ({ redirectSystemPath }), {
  keys: () => ['./+native-intent.tsx'],
  resolve: (key: string) => key,
  id: 'native-intent-test',
});
afterEach(() => jest.restoreAllMocks());

test.each(['ios', 'android'] as const)(
  'installed Router strips cold %s links before route decoding',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    for (const initial of [malformed, Promise.resolve(malformed)]) {
      jest.spyOn(installedLinking, 'getInitialURL').mockReturnValue(initial);
      const config = getLinkingConfig(
        route,
        context,
        () => {
          throw new Error('Unexpected early route decoding');
        },
        { skipGenerated: true, sitemap: false, notFound: false },
      );
      expect(await config.getInitialURL!()).toBe('/');
      expect(await config.getInitialURL!()).toBe('/');
    }
  },
);

test.each(['ios', 'android'] as const)(
  'installed Router strips warm %s links before notifying navigation',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    let callback: ((event: { url: string }) => void) | undefined;
    const remove = jest.fn();
    const addListener = ExpoLinking.addEventListener;
    jest.spyOn(ExpoLinking, 'addEventListener').mockImplementation((type, handler) => {
      callback = handler;
      const subscription = addListener(type, handler);
      const unsubscribe = subscription.remove.bind(subscription);
      subscription.remove = () => {
        remove();
        unsubscribe();
      };
      return subscription;
    });
    const listener = jest.fn();
    const unsubscribe = installedLinking.subscribe({ redirectSystemPath }, undefined)(listener);
    await callback!({ url: malformed });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('/');
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  },
);

test('external links cannot inject private routes, queries or oversized decoder input', () => {
  for (const path of [
    '',
    'mnelo://',
    'mnelo://account?delete=true',
    'https://mnelo.com/chat/private',
    malformed,
    '%'.repeat(1000000),
  ]) {
    for (const initial of [true, false]) expect(redirectSystemPath({ path, initial })).toBe('/');
  }
});
