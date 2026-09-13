import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { AudioPlayback } from '@/features/chats/AudioPlayback';
const mockPlayer = {
  isLoaded: false,
  replace: jest.fn(),
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn(),
};
const mockSource = jest.fn();
let mockBackground: ((state: AppStateStatus) => void) | undefined;
jest.mock('expo-audio', () => ({
  useAudioPlayer: (source: unknown) => {
    mockSource(source);
    return mockPlayer;
  },
  useAudioPlayerStatus: () => ({
    playing: false,
    didJustFinish: false,
    duration: 0,
    currentTime: 0,
  }),
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'change') mockBackground = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());
test('voice bubble mount never starts a download; play obtains fresh private access', async () => {
  const resolveUri = jest.fn(async () => 'https://development.invalid/fresh');
  await render(<AudioPlayback uri="https://development.invalid/expired" resolveUri={resolveUri} />);
  expect(mockSource).toHaveBeenCalledWith(null);
  expect(mockPlayer.replace).not.toHaveBeenCalled();
  expect(resolveUri).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  expect(resolveUri).toHaveBeenCalledTimes(1);
  expect(mockPlayer.replace).toHaveBeenCalledWith('https://development.invalid/fresh');
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});
test('a late URL cannot begin playback after backgrounding', async () => {
  let resolve!: (url: string) => void;
  await render(
    <AudioPlayback
      uri="unused"
      resolveUri={() =>
        new Promise((r) => {
          resolve = r;
        })
      }
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  await act(() => mockBackground?.('background'));
  await act(() => resolve('https://development.invalid/fresh'));
  expect(mockPlayer.replace).not.toHaveBeenCalled();
  expect(mockPlayer.play).not.toHaveBeenCalled();
});
test('a private voice message shows its known duration before downloading audio', async () => {
  await render(<AudioPlayback uri="unused" durationSeconds={65.8} />);
  expect(screen.getByText('0 / 66 seconds')).toBeTruthy();
  expect(mockPlayer.replace).not.toHaveBeenCalled();
});
test('sending or deleting a draft stops preview playback and rejects a late audio response', async () => {
  let resolve!: (uri: string) => void;
  const source = () =>
    new Promise<string>((done) => {
      resolve = done;
    });
  const props = {
    uri: 'unused',
    resolveUri: source,
    waveform: [0.1, 0.8, 0.2],
    durationSeconds: 65,
  };
  const view = await render(<AudioPlayback {...props} />);
  expect(screen.getByText('1:05')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  await view.rerender(<AudioPlayback {...props} disabled />);
  await act(() => resolve('file:///draft.m4a'));
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(mockPlayer.replace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
});
