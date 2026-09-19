import { MEDIA_TIMING_WINDOW_MS, observeMediaTiming } from '@/messenger/media-timing';
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
  expect(connectionTiming).toHaveBeenCalledTimes(1);
  expect(connectionTiming).toHaveBeenCalledWith('MEDIA_STATS_STARTED', 500);
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
  expect(connectionTiming).toHaveBeenCalledTimes(4);
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
  expect(connectionTiming).toHaveBeenCalledTimes(1);
  expect(connectionTiming).not.toHaveBeenCalledWith('REMOTE_AUDIO_RTP');
  expect(jest.getTimerCount()).toBe(0);
});
test('video arriving after ten seconds is measured independently from early audio', async () => {
  const rows: Record<string, unknown>[] = [
    { type: 'inbound-rtp', kind: 'audio', packetsReceived: 1 },
    { type: 'outbound-rtp', kind: 'video', framesEncoded: 1 },
  ];
  const peer = { getStats: jest.fn(async () => new Map(rows.map((row, i) => [i, row]))) };
  observeMediaTiming(peer as unknown as RTCPeerConnection, true);
  await jest.advanceTimersByTimeAsync(12000);
  expect(connectionTiming).toHaveBeenCalledWith('REMOTE_AUDIO_RTP');
  expect(connectionTiming).not.toHaveBeenCalledWith('REMOTE_VIDEO_DECODED');
  rows.push({ type: 'inbound-rtp', mediaType: 'video', framesDecoded: 1 });
  await jest.advanceTimersByTimeAsync(500);
  expect(connectionTiming).toHaveBeenCalledWith('REMOTE_VIDEO_DECODED');
  expect(jest.getTimerCount()).toBe(0);
  expect(
    jest.mocked(connectionTiming).mock.calls.filter(([stage]) => stage === 'REMOTE_AUDIO_RTP'),
  ).toHaveLength(1);
});
test('a hung native stats request times out without treating late completion as media arrival', async () => {
  let finish!: (value: Map<string, unknown>) => void;
  observeMediaTiming(
    {
      getStats: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    } as unknown as RTCPeerConnection,
    true,
  );
  await jest.advanceTimersByTimeAsync(MEDIA_TIMING_WINDOW_MS);
  expect(connectionTiming).toHaveBeenCalledWith('REMOTE_AUDIO_RTP_TIMEOUT');
  expect(connectionTiming).toHaveBeenCalledWith('REMOTE_VIDEO_DECODE_TIMEOUT');
  expect(connectionTiming).toHaveBeenCalledWith('LOCAL_VIDEO_ENCODE_TIMEOUT');
  finish(new Map([['audio', { type: 'inbound-rtp', kind: 'audio', packetsReceived: 3 }]]));
  await jest.advanceTimersByTimeAsync(1);
  expect(connectionTiming).not.toHaveBeenCalledWith('REMOTE_AUDIO_RTP');
  expect(jest.getTimerCount()).toBe(0);
});
test('unsupported and repeatedly failing stats are explicit and bounded', async () => {
  observeMediaTiming({} as RTCPeerConnection, false);
  expect(connectionTiming).toHaveBeenCalledWith('MEDIA_STATS_UNAVAILABLE');
  expect(jest.getTimerCount()).toBe(0);
  jest.clearAllMocks();
  observeMediaTiming(
    {
      getStats: async () => {
        throw new Error('native peer closed');
      },
    } as unknown as RTCPeerConnection,
    false,
  );
  await jest.advanceTimersByTimeAsync(MEDIA_TIMING_WINDOW_MS);
  expect(
    jest
      .mocked(connectionTiming)
      .mock.calls.filter(([stage]) => stage === 'MEDIA_STATS_READ_FAILED'),
  ).toHaveLength(1);
  expect(connectionTiming).toHaveBeenCalledWith('REMOTE_AUDIO_RTP_TIMEOUT');
  expect(connectionTiming).not.toHaveBeenCalledWith('REMOTE_VIDEO_DECODE_TIMEOUT');
  expect(jest.getTimerCount()).toBe(0);
});
