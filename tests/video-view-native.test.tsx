import { render, screen } from '@testing-library/react-native';
import { VideoView } from '@/messenger/VideoView.native';
import { connectionTiming } from '@/messenger/connection-timing';
jest.mock('@/messenger/connection-timing', () => ({ connectionTiming: jest.fn() }));
let mockTracks: { id: string }[] = [];
let mockDimensions:
  ((event: { nativeEvent: { width: number; height: number } }) => void) | undefined;
jest.mock('@livekit/react-native-webrtc', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    RTCView: (props: { onDimensionsChange: typeof mockDimensions }) => {
      mockDimensions = props.onDimensionsChange;
      // The native streamURL setter binds once; a new track on the same URL
      // does not itself trigger that setter.
      const [bound] = React.useState(() => mockTracks[0]?.id ?? 'audio-only');
      return <Text>{bound}</Text>;
    },
  };
});
test('a later video track on the same native stream binds immediately, without waiting for another URL', async () => {
  mockTracks = [];
  const stream = {
    toURL: () => 'same-native-stream',
    getVideoTracks: () => mockTracks,
  } as unknown as MediaStream;
  const view = await render(<VideoView stream={stream} />);
  expect(screen.getByText('audio-only')).toBeTruthy();
  mockTracks.push({ id: 'video-arrived' });
  await view.rerender(<VideoView stream={stream} />);
  expect(screen.getByText('video-arrived')).toBeTruthy();
  mockDimensions?.({ nativeEvent: { width: 2, height: 2 } });
  expect(connectionTiming).not.toHaveBeenCalled();
  mockDimensions?.({ nativeEvent: { width: 640, height: 480 } });
  expect(connectionTiming).toHaveBeenCalledWith('REMOTE_VIDEO_FRAME');
});
