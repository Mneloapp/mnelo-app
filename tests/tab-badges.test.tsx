import { render, screen } from '@testing-library/react-native';
import TabLayout from '../app/(tabs)/_layout';
let mockCounts = { messages: 123, calls: 2 };
jest.mock('@/messenger/attention', () => ({ useAttentionCounts: () => ({ data: mockCounts }) }));
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
      navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
      insets: { top: 59, bottom: 34, left: 0, right: 0 },
    });
  };
  Tabs.Screen = function Screen() {
    return null;
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
