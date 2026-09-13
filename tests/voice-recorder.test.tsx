import { fireEvent, render, screen } from '@testing-library/react-native';
import type { RecordingStatus } from 'expo-audio';
import { VoiceRecorder } from '@/features/chats/VoiceRecorder';
let mockFinished: (event: RecordingStatus) => void;
const mockOptions = jest.fn();
let mockState = { isRecording: true, durationMillis: 16500 };
const mockRecorder = {
  getStatus: () => mockState,
  stop: jest.fn(async () => {
    mockState = { isRecording: false, durationMillis: 0 };
    mockFinished({
      id: 'development',
      isFinished: true,
      hasError: false,
      error: null,
      url: 'file:///development.m4a',
    });
  }),
};
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: (options: unknown, callback: typeof mockFinished) => {
    mockOptions(options);
    mockFinished = callback;
    return mockRecorder;
  },
  useAudioRecorderState: () => mockState,
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/features/chats/media-files', () => ({ discardCachedMedia: jest.fn() }));
jest.mock('@/features/chats/AudioPlayback', () => ({ AudioPlayback: () => null }));
test('stopping retains duration when Android resets native state, and cancel clears the preview', async () => {
  const onReady = jest.fn();
  await render(<VoiceRecorder onReady={onReady} />);
  expect(screen.getByLabelText('16 seconds recorded')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));
  expect(screen.getByText('Listen before sending')).toBeTruthy();
  expect(onReady).toHaveBeenLastCalledWith({
    uri: 'file:///development.m4a',
    name: 'voice.m4a',
    mime: 'audio/mp4',
    duration: 16.5,
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByLabelText('0 seconds recorded')).toBeTruthy();
  expect(onReady).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();
});

test('inline recorder starts from the microphone action, retains preview, and deletes on request', async () => {
  mockState = { isRecording: false, durationMillis: 0 };
  const audio = jest.requireMock('expo-audio');
  audio.AudioModule = {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  };
  Object.assign(mockRecorder, {
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(() => {
      mockState = { isRecording: true, durationMillis: 1000 };
    }),
  });
  const onReady = jest.fn(),
    onCancel = jest.fn(),
    onSend = jest.fn();
  const view = await render(
    <VoiceRecorder autoStart onReady={onReady} onCancel={onCancel} onSend={onSend} />,
  );
  expect(audio.AudioModule.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(mockOptions).toHaveBeenCalledWith(expect.objectContaining({ isMeteringEnabled: true }));
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(
    (mockRecorder as typeof mockRecorder & { record: jest.Mock }).record,
  ).toHaveBeenCalledTimes(1);
  await view.rerender(
    <VoiceRecorder autoStart onReady={onReady} onCancel={onCancel} onSend={onSend} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));
  expect(onReady).toHaveBeenLastCalledWith(expect.objectContaining({ mime: 'audio/mp4' }));
  expect(onCancel).not.toHaveBeenCalled();
  expect(onSend).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  expect(onSend).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  expect(onReady).toHaveBeenLastCalledWith(null);
  expect(onCancel).toHaveBeenCalledTimes(1);
});
