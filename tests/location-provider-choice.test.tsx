import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { LocationProviderChoice } from '@/messenger/components/LocationProviderChoice';

jest.mock('@/components/ActionSheet', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    ActionSheet: ({
      visible,
      onClose,
      onDismiss,
      children,
    }: {
      visible: boolean;
      onClose: () => void;
      onDismiss: () => void;
      children: React.ReactNode;
    }) => (
      <View>
        {visible && children}
        <Text onPress={onClose}>Cancel picker</Text>
        <Text onPress={onDismiss}>Native dismiss completed</Text>
      </View>
    ),
  };
});
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);

test('provider choice waits for native sheet dismissal before launching a map; cancellation launches nothing', async () => {
  const original = Platform.OS;
  Platform.OS = 'ios';
  const close = jest.fn(),
    choose = jest.fn();
  try {
    await render(<LocationProviderChoice visible onClose={close} onChoose={choose} />);
    await fireEvent.press(screen.getByText('Apple Maps'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Native dismiss completed'));
    expect(choose).toHaveBeenCalledWith('apple');
    await fireEvent.press(screen.getByText('Google Maps'));
    expect(choose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Native dismiss completed'));
    expect(choose).toHaveBeenLastCalledWith('google');
    await fireEvent.press(screen.getByText('Cancel picker'));
    await fireEvent.press(screen.getByText('Native dismiss completed'));
    expect(choose).toHaveBeenCalledTimes(2);
  } finally {
    Platform.OS = original;
  }
});
