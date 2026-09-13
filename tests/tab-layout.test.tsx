import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Native from 'react-native';
import * as SafeArea from 'react-native-safe-area-context';
import TabLayout from '../app/(tabs)/_layout';

jest.mock('@/messenger/attention', () => ({ useAttentionCounts: () => ({ data: undefined }) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  type MockOptions = {
    tabBarStyle: { height: number };
    tabBarLabel: (props: { color: string; children: string }) => React.ReactNode;
  };
  const Tabs = ({ screenOptions }: { screenOptions: MockOptions }) =>
    React.createElement(
      View,
      { testID: 'tab-bar', style: screenOptions.tabBarStyle },
      ...['Chats', 'Calls', 'Me'].map((title) =>
        React.createElement(
          View,
          { key: title },
          screenOptions.tabBarLabel({ color: 'black', children: title }),
        ),
      ),
    );
  Tabs.Screen = function Screen() {
    return null;
  };
  return { Tabs };
});

let dimensions = { width: 393, height: 852, scale: 3, fontScale: 1.35 };
beforeEach(() => {
  dimensions = { width: 393, height: 852, scale: 3, fontScale: 1.35 };
  Native.Dimensions.set({ window: dimensions, screen: dimensions });
  jest
    .spyOn(SafeArea, 'useSafeAreaInsets')
    .mockReturnValue({ top: 59, bottom: 34, left: 0, right: 0 });
});
const originalPlatform = Native.Platform.OS;
afterEach(() => {
  Native.Platform.OS = originalPlatform;
  jest.restoreAllMocks();
});

const height = () => screen.getByTestId('tab-bar').props.style.height as number;
const measure = (label: string, heights: number[]) =>
  fireEvent(screen.getByText(label), 'textLayout', {
    nativeEvent: { lines: heights.map((lineHeight) => ({ height: lineHeight })) },
  });

test('enlarged single-line labels do not reserve a blank second line', async () => {
  await render(<TabLayout />);
  await measure('Calls', [25]);
  // 24-point icon, 25-point label, 16-point combined spacing, border and 18-point home-indicator clearance.
  expect(height()).toBe(84);
});

test('actual wrapping grows the shared bar, then contracts when the label fits again', async () => {
  await render(<TabLayout />);
  await measure('Calls', [25, 25]);
  expect(height()).toBe(109);
  await measure('Chats', [25]);
  expect(height()).toBe(109);
  await measure('Calls', [25]);
  expect(height()).toBe(84);
});

test('screen width and Dynamic Type changes discard obsolete two-line measurements', async () => {
  const view = await render(<TabLayout />);
  await measure('Calls', [25, 25]);
  dimensions = { ...dimensions, width: 430 };
  await act(() => Native.Dimensions.set({ window: dimensions, screen: dimensions }));
  await view.rerender(<TabLayout />);
  expect(height()).toBeCloseTo(83.3);
  await measure('Calls', [25, 25]);
  dimensions = { ...dimensions, fontScale: 1 };
  await act(() => Native.Dimensions.set({ window: dimensions, screen: dimensions }));
  await view.rerender(<TabLayout />);
  expect(height()).toBe(77);
});

test('devices without a home inset do not get unnecessary bottom padding', async () => {
  jest
    .spyOn(SafeArea, 'useSafeAreaInsets')
    .mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
  await render(<TabLayout />);
  await measure('Calls', [25]);
  expect(height()).toBe(66);
});

test('Android keeps its full system navigation inset', async () => {
  Native.Platform.OS = 'android';
  await render(<TabLayout />);
  await measure('Calls', [25]);
  expect(height()).toBe(100);
  expect(screen.getByTestId('tab-bar').props.style.paddingBottom).toBe(34);
});
