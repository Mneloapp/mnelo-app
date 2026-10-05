import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Native from 'react-native';
import TabLayout from '../app/(tabs)/_layout';

const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));
let mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
jest.mock('@/messenger/attention', () => ({ useAttentionCounts: () => ({ data: undefined }) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Tabs = ({
    children,
    tabBar,
  }: {
    children: React.ReactNode;
    tabBar: (props: unknown) => React.ReactNode;
  }) => {
    const routes = React.Children.toArray(children).map((child) => {
      const element = child as React.ReactElement<{ name: string; options: { title: string } }>;
      return { key: element.props.name, name: element.props.name, options: element.props.options };
    });
    return tabBar({
      state: { routes, index: 0 },
      descriptors: Object.fromEntries(
        routes.map((route) => [route.key, { options: route.options }]),
      ),
      navigation: { emit: mockEmit, navigate: mockNavigate },
      insets: mockInsets,
    });
  };
  Tabs.Screen = function Screen() {
    return null;
  };
  return { Tabs };
});

const originalPlatform = Native.Platform.OS;
let dimensions = { width: 393, height: 852, scale: 3, fontScale: 1.35 };
beforeEach(() => {
  dimensions = { width: 393, height: 852, scale: 3, fontScale: 1.35 };
  Native.Dimensions.set({ window: dimensions, screen: dimensions });
  mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
  mockEmit.mockReturnValue({ defaultPrevented: false });
});
afterEach(() => {
  Native.Platform.OS = originalPlatform;
});

function safePadding() {
  const tab = screen.getByRole('tab', { name: 'Chats' });
  return Native.StyleSheet.flatten(tab.parent?.parent?.props.style).paddingBottom;
}

test('tab press preserves navigation events, prevents intercepted navigation and does not navigate to the active tab', async () => {
  await render(<TabLayout />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Calls' }));
  expect(mockEmit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: 'calls',
    canPreventDefault: true,
  });
  expect(mockNavigate).toHaveBeenCalledWith('calls', undefined);
  mockNavigate.mockClear();
  mockEmit.mockReturnValue({ defaultPrevented: true });
  await fireEvent.press(screen.getByRole('tab', { name: 'Me' }));
  expect(mockNavigate).not.toHaveBeenCalled();
  mockEmit.mockReturnValue({ defaultPrevented: false });
  await fireEvent.press(screen.getByRole('tab', { name: 'Chats' }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('large text and width changes preserve all named controls without a fixed tab-bar height', async () => {
  const rendered = await render(<TabLayout />);
  dimensions = { ...dimensions, width: 320, fontScale: 2 };
  await act(() => Native.Dimensions.set({ window: dimensions, screen: dimensions }));
  await rendered.rerender(<TabLayout />);
  for (const name of ['Chats', 'Calls', 'Me']) {
    expect(screen.getByRole('tab', { name })).toBeOnTheScreen();
  }
  const label = screen.getByText('Chats');
  expect(label.props.maxFontSizeMultiplier).toBe(2);
  expect(label.props.numberOfLines).toBeUndefined();
  const tab = screen.getByRole('tab', { name: 'Chats' });
  expect(Native.StyleSheet.flatten(tab.props.style).flexDirection).toBe('column');
  expect(Native.StyleSheet.flatten(tab.parent?.props.style).height).toBeUndefined();
});

test('iPhone floating navigation leaves the home indicator clear', async () => {
  Native.Platform.OS = 'ios';
  await render(<TabLayout />);
  expect(safePadding()).toBe(18);
});

test('without a system inset only the floating capsule margin remains', async () => {
  mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  await render(<TabLayout />);
  expect(safePadding()).toBe(12);
});

test('Android keeps its full system navigation inset', async () => {
  Native.Platform.OS = 'android';
  await render(<TabLayout />);
  expect(safePadding()).toBe(34);
});
