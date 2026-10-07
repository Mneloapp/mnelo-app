import { fireEvent, render, screen } from '@testing-library/react-native';
import { FocusTabBar, type FocusTabItem } from '@/components/FocusTabBar';
import { FocusTabHeader } from '@/components/FocusTabHeader';

test('compact navigation keeps every tab named, exposes attention and invokes its own action', async () => {
  const onPress = jest.fn();
  const onLongPress = jest.fn();
  const items: FocusTabItem[] = [
    {
      key: 'chats',
      label: 'Chats',
      accessibilityLabel: 'Chats. 4 unread messages',
      icon: 'message-circle',
      selected: true,
      count: 4,
      countLabel: '4 unread messages',
      onPress,
      onLongPress,
    },
    {
      key: 'calls',
      label: 'Calls',
      accessibilityLabel: 'Calls. 2 missed calls',
      icon: 'phone',
      selected: false,
      count: 2,
      countLabel: '2 missed calls',
      onPress,
      onLongPress,
    },
    {
      key: 'me',
      label: 'Me',
      accessibilityLabel: 'Me',
      icon: 'user',
      selected: false,
      count: 0,
      countLabel: '',
      onPress,
      onLongPress,
    },
  ];
  await render(<FocusTabBar items={items} insets={{ left: 0, right: 0, bottom: 34 }} />);
  expect(
    screen.getByRole('tab', { name: 'Chats. 4 unread messages' }).props.accessibilityState.selected,
  ).toBe(true);
  const calls = screen.getByRole('tab', { name: 'Calls. 2 missed calls' });
  expect(calls.props.accessibilityState.selected).toBe(false);
  expect(screen.getByRole('tab', { name: 'Me' })).toBeOnTheScreen();
  await fireEvent.press(calls);
  await fireEvent(calls, 'longPress');
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(onLongPress).toHaveBeenCalledTimes(1);
});

test('screen heading reveals pull search from its title without a separate search button', async () => {
  const compose = jest.fn();
  const search = jest.fn();
  await render(
    <FocusTabHeader
      title="Chats"
      actionLabel="New chat"
      onAction={compose}
      onTitlePress={search}
      titleActionLabel="Show chat search"
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'New chat' }));
  expect(compose).toHaveBeenCalledTimes(1);
  expect(search).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Search' })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Show chat search' }));
  expect(search).toHaveBeenCalledTimes(1);
});
