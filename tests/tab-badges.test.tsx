import { render, screen } from '@testing-library/react-native';
import TabLayout from '../app/(tabs)/_layout';
let mockCounts = { messages: 123, calls: 2 };
jest.mock('@/messenger/attention', () => ({ useAttentionCounts: () => ({ data: mockCounts }) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  Tabs.Screen = function Screen({
    options,
  }: {
    options: {
      tabBarAccessibilityLabel: string;
      tabBarIcon: (props: { focused: boolean }) => React.ReactNode;
    };
  }) {
    return React.createElement(
      View,
      { accessibilityLabel: options.tabBarAccessibilityLabel },
      options.tabBarIcon({ focused: false }),
    );
  };
  return { Tabs };
});
test('Chats and Calls show independent numeric badges and clear them immediately when acknowledged', async () => {
  const view = await render(<TabLayout />);
  expect(screen.getByLabelText('Chats. 123 unread messages')).toBeOnTheScreen();
  expect(screen.getByLabelText('Calls. 2 missed calls')).toBeOnTheScreen();
  // Decorative icon badges are hidden from accessibility; the complete count is on the tab.
  expect(screen.getByText('99+', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy();
  mockCounts = { messages: 0, calls: 2 };
  await view.rerender(<TabLayout />);
  expect(screen.queryByText('99+', { includeHiddenElements: true })).toBeNull();
  expect(screen.getByLabelText('Calls. 2 missed calls')).toBeOnTheScreen();
  mockCounts = { messages: 0, calls: 0 };
  await view.rerender(<TabLayout />);
  expect(screen.queryByText('2', { includeHiddenElements: true })).toBeNull();
  expect(screen.getByLabelText('Me')).toBeOnTheScreen();
});
