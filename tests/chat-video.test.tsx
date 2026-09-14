import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ChatVideo } from '@/messenger/components/ChatVideo';
const mockDispose = jest.fn();
const mockPrepare = jest.fn();
const mockPlayer = {
  status: 'readyToPlay',
  play: jest.fn(),
  pause: jest.fn(),
  replaceAsync: jest.fn(async () => {}),
};
jest.mock('@/messenger/video-preview', () => ({
  prepareVideoPreview: (...args: unknown[]) => mockPrepare(...args),
}));
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  useEvent: () => ({ status: 'readyToPlay' }),
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => mockPlayer,
  VideoView: jest.requireActual('react-native').View,
}));
const media = { name: 'video.mp4', mime: 'video/mp4', bytes: 'YQ==', duration: 3 };
const preview = {
  uri: 'file:///cache/video.mp4',
  thumbnail: { uri: 'file:///cache/poster.jpg', width: 600, height: 800 },
  dispose: mockDispose,
};
test('video loads only a poster until tapped; closing returns to the same preview and unmount removes cached media', async () => {
  mockPrepare.mockResolvedValueOnce(preview);
  const size = jest.fn();
  const select = jest.fn();
  const view = await render(
    <ChatVideo
      media={media}
      size={{ width: 300, height: 400 }}
      onDimensions={size}
      onLongPress={select}
    />,
  );
  await waitFor(() => expect(size).toHaveBeenCalledWith(preview.thumbnail));
  expect(mockPlayer.play).not.toHaveBeenCalled();
  await fireEvent(screen.getByRole('button', { name: 'Play video' }), 'longPress');
  expect(select).toHaveBeenCalledTimes(1);
  expect(mockPlayer.play).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Play video' }));
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  expect(mockPlayer.replaceAsync).toHaveBeenCalledWith(preview.uri);
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('button', { name: 'Play video' })).toBeOnTheScreen();
  expect(mockDispose).not.toHaveBeenCalled();
  await view.unmount();
  expect(mockDispose).toHaveBeenCalledTimes(1);
});
test('a video prepared after scrolling the row away is discarded without updating the unmounted row', async () => {
  let finish!: (value: typeof preview) => void;
  mockPrepare.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const size = jest.fn();
  const view = await render(
    <ChatVideo
      media={media}
      size={{ width: 300, height: 400 }}
      onDimensions={size}
      onLongPress={() => {}}
    />,
  );
  await view.unmount();
  await act(() => finish(preview));
  expect(mockDispose).toHaveBeenCalledTimes(1);
  expect(size).not.toHaveBeenCalled();
});
