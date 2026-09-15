import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CallScreen } from '@/messenger/screens/CallScreen';
import type { DeviceCall } from '@/messenger/calls';

jest.mock('@/messenger/system-calls', () => ({ systemCallAudio: () => false }));
let mockFocused = true;
let mockRouteMedia: 'voice' | 'video' | undefined;
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: 'chat', media: mockRouteMedia }),
  usePathname: () => '/call/chat',
  useIsFocused: () => mockFocused,
}));
jest.mock('@/messenger/VideoView', () => ({
  VideoView: ({ stream, local }: { stream: { id: string }; local?: boolean }) => {
    const { View } = jest.requireActual('react-native');
    return (
      <View
        testID={'stream-' + stream.id}
        accessibilityLabel={local ? 'Local preview' : 'Remote playback'}
      />
    );
  },
}));
const mockListeners = new Set<() => void>();
let mockCall: DeviceCall | null;
const mockProfile = jest.fn(async () => ({ avatar: '' }));
const mockCalls = {
  subscribe: (listener: () => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
  snapshot: () => mockCall,
  start: jest.fn(async () => {}),
  confirmIncoming: jest.fn(async () => {}),
  accept: jest.fn(async () => {
    update({ status: 'connecting' });
  }),
  end: jest.fn(async () => {
    update({ status: 'ended', local: null, remote: null });
  }),
  mute: jest.fn(() => {
    update({ muted: !mockCall?.muted });
  }),
  speaker: jest.fn(async () => {
    update({ speaker: !mockCall?.speaker });
  }),
  camera: jest.fn(() => {
    update({ camera: !mockCall?.camera });
  }),
  switchCamera: jest.fn(async () => {}),
};
function update(value: Partial<DeviceCall>) {
  if (mockCall) mockCall = { ...mockCall, ...value };
  mockListeners.forEach((listener) => listener());
}
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    identity: { key: 'self' },
    calls: mockCalls,
    engine: { contactProfile: mockProfile },
    view: {
      chat: async () => ({ title: 'Phonebook name ❤️', kind: 'direct' }),
      members: async () => [{ key: 'self' }, { key: 'peer' }],
    },
  }),
}));
function stream(id: string, video = false) {
  return { id, getVideoTracks: () => (video ? [{ enabled: true }] : []) } as unknown as MediaStream;
}
async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const result = await render(
    <QueryClientProvider client={client}>
      <CallScreen />
    </QueryClientProvider>,
  );
  await screen.findByText('Phonebook name ❤️');
  await fireEvent(screen.getByTestId('call-stage'), 'layout', {
    nativeEvent: { layout: { width: 361, height: 400 } },
  });
  return result;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockRouteMedia = undefined;
  jest.mocked(router.canGoBack).mockReturnValue(true);
  mockProfile.mockResolvedValue({ avatar: '' });
  mockCall = {
    id: 'call',
    chat: 'chat',
    peer: 'peer',
    media: 'voice',
    incoming: false,
    status: 'ringing',
    local: stream('local'),
    remote: null,
    muted: false,
    speaker: false,
    camera: false,
  };
});

test('voice calls use the phonebook name and peer photo, and minimizing keeps the call running', async () => {
  mockProfile.mockResolvedValue({ avatar: 'cGhvdG8=' });
  await show();
  await waitFor(() =>
    expect(
      screen.getByTestId('profile-photo', { includeHiddenElements: true }).props.source.uri,
    ).toBe('data:image/jpeg;base64,cGhvdG8='),
  );
  expect(mockProfile).toHaveBeenCalledWith('peer');
  expect(screen.getByText('Calling…')).toBeOnTheScreen();
  expect(mockCalls.start).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Return to conversation' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(mockCalls.end).not.toHaveBeenCalled();
  await act(() => update({ status: 'ended' }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('voice audio stays mounted and mute/speaker actions expose their new state', async () => {
  mockCall = { ...mockCall!, status: 'active', remote: stream('remote') };
  await show();
  expect(
    within(screen.getByTestId('call-audio', { includeHiddenElements: true })).getByTestId(
      'stream-remote',
      { includeHiddenElements: true },
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByTestId('call-remote-video')).toBeNull();
  expect(screen.getByText('Connected')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Mute' }));
  expect(screen.getByRole('button', { name: 'Unmute', selected: true })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Speaker' }));
  expect(screen.getByRole('button', { name: 'Earpiece', selected: true })).toBeOnTheScreen();
  expect(mockCalls.mute).toHaveBeenCalledTimes(1);
  expect(mockCalls.speaker).toHaveBeenCalledTimes(1);
});

test('video uses local preview before connecting, then remote video and a separate self preview', async () => {
  mockCall = { ...mockCall!, media: 'video', camera: true, local: stream('local', true) };
  await show();
  expect(
    within(screen.getByTestId('call-local-video')).getByTestId('stream-local'),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Switch camera' }));
  expect(mockCalls.switchCamera).toHaveBeenCalledTimes(1);
  await act(() => update({ status: 'active', remote: stream('remote', true) }));
  expect(
    within(screen.getByTestId('call-remote-video', { includeHiddenElements: true })).getByTestId(
      'stream-remote',
      { includeHiddenElements: true },
    ),
  ).toBeOnTheScreen();
  expect(
    within(screen.getByTestId('call-self-preview')).getByTestId('stream-local'),
  ).toBeOnTheScreen();
  expect(screen.queryByTestId('call-local-video')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Camera off' }));
  expect(screen.queryByTestId('call-self-preview')).toBeNull();
  expect(screen.getByRole('button', { name: 'Camera on', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Switch camera' })).toBeDisabled();
  expect(
    screen.getByTestId('call-remote-video', { includeHiddenElements: true }),
  ).toBeOnTheScreen();
});

test('hangup remains available during an audio route change and ends only once', async () => {
  let finish!: () => void;
  mockCalls.speaker.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Speaker' }));
  const end = screen.getByRole('button', { name: 'End call' });
  expect(end).not.toBeDisabled();
  await fireEvent.press(end);
  await screen.findByText('Call ended');
  expect(mockCalls.end).toHaveBeenCalledTimes(1);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'End call' })).toBeNull();
  await act(() => finish());
});

test('incoming calls expose accept/decline and connection failure returns to the previous screen', async () => {
  mockCall = { ...mockCall!, incoming: true, status: 'incoming', local: null };
  await show();
  expect(screen.getByRole('button', { name: 'Decline' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
  expect(mockCalls.accept).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Connecting…')).toBeOnTheScreen();
  await act(() => update({ status: 'failed', local: null, remote: null }));
  expect(screen.getByText('The call could not connect.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'End call' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
  expect(router.back).toHaveBeenCalledTimes(1);
});

test.each(['voice', 'video'] as const)(
  '%s hangup returns immediately while call cleanup is pending',
  async (media) => {
    let finish!: () => void;
    mockCall = { ...mockCall!, media, status: 'active' };
    mockCalls.end.mockImplementationOnce(async () => {
      update({ status: 'ended', local: null, remote: null });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await show();
    await fireEvent.press(screen.getByRole('button', { name: 'End call' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    await act(() => update({ diagnostic: 'ENDED' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    await act(() => finish());
  },
);

test.each(['voice', 'video'] as const)(
  '%s remote hangup closes the call without a second tap',
  async (media) => {
    mockCall = { ...mockCall!, media, status: 'active' };
    await show();
    await act(() => update({ status: 'ended', local: null, remote: null }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(mockCalls.end).not.toHaveBeenCalled();
  },
);

test('a covered call route does not pop another screen when the other person hangs up', async () => {
  await show();
  mockFocused = false;
  await act(() => update({ status: 'ended' }));
  expect(router.back).not.toHaveBeenCalled();
  mockFocused = true;
  await act(() => update({ diagnostic: 'ENDED' }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('declining a call opened without navigation history returns to Calls', async () => {
  jest.mocked(router.canGoBack).mockReturnValue(false);
  mockCall = { ...mockCall!, incoming: true, status: 'incoming', local: null };
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/(tabs)/calls');
});

test('starting a new call ignores the retained ended snapshot, then closes when the new call ends', async () => {
  mockRouteMedia = 'voice';
  mockCall = { ...mockCall!, status: 'ended' };
  mockCalls.start.mockImplementationOnce(async () => {
    update({ id: 'next-call', status: 'ringing' });
  });
  await show();
  await waitFor(() => expect(mockCalls.start).toHaveBeenCalledWith('peer', 'voice'));
  expect(router.back).not.toHaveBeenCalled();
  await act(() => update({ status: 'ended' }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('outgoing status changes from Calling to Ringing only with a recipient receipt, then Connecting', async () => {
  mockCall = { ...mockCall!, incoming: false, status: 'ringing' };
  await show();
  expect(screen.getByText('Calling…')).toBeTruthy();
  expect(screen.queryByText('Ringing…')).toBeNull();
  await act(async () => update({ ringingConfirmed: true }));
  expect(screen.getByText('Ringing…')).toBeTruthy();
  await act(async () => update({ status: 'connecting' }));
  expect(screen.getByText('Connecting…')).toBeTruthy();
  expect(screen.queryByText('Ringing…')).toBeNull();
});
