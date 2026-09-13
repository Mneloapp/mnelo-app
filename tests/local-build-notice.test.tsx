import { render, screen } from '@testing-library/react-native';
import { Page } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { messengerRuntime as env } from '@/messenger/runtime';

jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);

test('an optimized local diagnostic build retains its explicit development-build notice', async () => {
  const previous = __DEV__;
  Object.assign(globalThis, { __DEV__: false });
  try {
    const view = await render(
      <Page title="Mnelo">
        <AppText>Content</AppText>
      </Page>,
    );
    expect(screen.getByText('Device-owned messenger · development build')).toBeOnTheScreen();
    await view.unmount();
  } finally {
    Object.assign(globalThis, { __DEV__: previous });
  }
});

test('a hosted production environment never presents local test-account instructions', async () => {
  const replaced = jest.replaceProperty(env, 'appEnv', 'production');
  try {
    const view = await render(
      <Page title="Mnelo">
        <AppText>Content</AppText>
      </Page>,
    );
    expect(screen.queryByText('Device-owned messenger · development build')).toBeNull();
    await view.unmount();
  } finally {
    replaced.restore();
  }
});
