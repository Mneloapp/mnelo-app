import { observeMediaTiming } from '@/messenger/media-timing';
import { connectionTiming } from '@/messenger/connection-timing';
jest.mock('@/messenger/connection-timing', () => ({ connectionTiming: jest.fn() }));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());
test('transport connection does not count as audio arrival or a decoded video frame', async () => {
  let rows: Record<string, unknown>[] = [];
  const peer = { getStats: jest.fn(async () => new Map(rows.map((row, i) => [i, row]))) };
  const stop = observeMediaTiming(peer as unknown as RTCPeerConnection, true);
  await jest.advanceTimersByTimeAsync(500);
  expect(connectionTiming).not.toHaveBeenCalled();
  rows = [
    { type: 'inbound-rtp', kind: 'audio', packetsReceived: 4 },
    { type: 'outbound-rtp', kind: 'video', framesEncoded: 1 },
  ];
  await jest.advanceTimersByTimeAsync(500);
  expect(connectionTiming).toHaveBeenCalledWith('REMOTE_AUDIO_RTP');
  expect(connectionTiming).toHaveBeenCalledWith('LOCAL_VIDEO_ENCODED');
  expect(connectionTiming).not.toHaveBeenCalledWith('REMOTE_VIDEO_DECODED');
  rows.push({ type: 'inbound-rtp', kind: 'video', framesDecoded: 1 });
  await jest.advanceTimersByTimeAsync(500);
  expect(connectionTiming).toHaveBeenCalledTimes(3);
  expect(jest.getTimerCount()).toBe(0);
  stop();
});
test('hangup suppresses statistics arriving later from the native bridge', async () => {
  let finish!: (value: Map<string, unknown>) => void;
  const stop = observeMediaTiming(
    {
      getStats: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    } as unknown as RTCPeerConnection,
    false,
  );
  stop();
  finish(
    new Map([
      [
        'private-peer-id',
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 9, address: 'private-address' },
      ],
    ]),
  );
  await jest.advanceTimersByTimeAsync(1000);
  expect(connectionTiming).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
