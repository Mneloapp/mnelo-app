import { analyzeCallTimings } from '../scripts/analyze-call-timings';

const event = (stage: string, at: number) => ({ stage, at });

test('lock-screen answer uses the native action and exposes startup, transport and media separately', () => {
  const report = analyzeCallTimings([
    event('APP_STARTED', 100),
    event('ANSWER_ACTION', 1000),
    event('AUDIO_ACTIVATED', 1020),
    event('ANSWER_ACCEPTED', 2600),
    event('CAPTURE_INCOMING_READY', 2750),
    event('MEDIA_TRANSPORT_CONNECTED', 2900),
    event('MEDIA_STATS_STARTED', 2900),
    event('REMOTE_AUDIO_RTP', 3000),
    event('LOCAL_VIDEO_ENCODED', 3100),
    event('REMOTE_VIDEO_DECODED', 4000),
    event('REMOTE_VIDEO_DECODED', 9000),
    event('REMOTE_VIDEO_FRAME', 4050),
    event('CALL_ENDED', 10000),
  ]);
  expect(report.calls).toEqual([
    {
      acceptance: 'native-answer-action',
      acceptedAt: 1000,
      measurements: {
        nativeAnswerActionMs: 0,
        javascriptAnswerHandlerMs: 1600,
        captureReadyMs: 1750,
        audioSessionActivatedMs: 20,
        transportConnectedMs: 1900,
        firstAudioRtpObservedMs: 2000,
        firstLocalVideoEncodedObservedMs: 2100,
        firstVideoDecodedObservedMs: 3000,
        firstVideoRendererEventMs: 3050,
      },
      statsStarted: true,
      statsUnavailable: false,
      statsReadFailed: false,
      timedOut: [],
      endedBy: 'CALL_ENDED',
      endedAfterMs: 9000,
    },
  ]);
  expect(report.statsSamplingIntervalMs).toBe(500);
  expect(report.limitations.join(' ')).toContain('does not prove audible playback');
});

test('foreground JS acceptance remains the anchor even when CallKit responds later', () => {
  const report = analyzeCallTimings([
    event('AUDIO_ACTIVATED', 950),
    event('ANSWER_ACCEPTED', 1000),
    event('ANSWER_ACTION', 1050),
    event('REMOTE_AUDIO_RTP', 1300),
    event('CALL_STOPPED', 2000),
    event('REMOTE_VIDEO_DECODED', 2100),
    event('ANSWER_ACCEPTED', 3000),
    event('CALL_FAILED', 3200),
  ]);
  expect(report.calls).toHaveLength(2);
  expect(report.calls[0]!.acceptance).toBe('local-answer-handler');
  expect(report.calls[0]!.measurements).toEqual({
    javascriptAnswerHandlerMs: 0,
    nativeAnswerActionMs: 50,
    audioSessionActivatedMs: -50,
    firstAudioRtpObservedMs: 300,
  });
  expect(report.calls[1]!.measurements).toEqual({ javascriptAnswerHandlerMs: 0 });
  expect(report.calls[1]!.endedBy).toBe('CALL_FAILED');
});

test('remote acceptance is explicitly its receive time and never reuses an earlier call activation', () => {
  const report = analyzeCallTimings([
    event('ANSWER_ACCEPTED', 1000),
    event('AUDIO_ACTIVATED', 1200),
    event('REMOTE_ACCEPT_RECEIVED', 2000),
    event('MEDIA_STATS_UNAVAILABLE', 2500),
    event('CALL_ENDED', 3000),
  ]);
  expect(report.calls[0]!.endedBy).toBe('NEXT_ACCEPTANCE');
  expect(report.calls[1]!.acceptance).toBe('remote-accept-received');
  expect(report.calls[1]!.measurements).toEqual({});
  expect(report.calls[1]!.statsUnavailable).toBe(true);
});

test('missing media and old traces are not invented as zero latency', () => {
  expect(
    analyzeCallTimings([event('MEDIA_TRANSPORT_CONNECTED', 1000), event('REMOTE_AUDIO_RTP', 1500)])
      .calls,
  ).toEqual([]);
  const report = analyzeCallTimings([
    event('ANSWER_ACTION', 1000),
    event('MEDIA_STATS_STARTED', 1500),
    event('MEDIA_STATS_READ_FAILED', 2000),
    event('REMOTE_AUDIO_RTP_TIMEOUT', 31500),
    event('REMOTE_AUDIO_RTP_TIMEOUT', 31501),
    event('APP_STARTED', 40000),
    event('REMOTE_AUDIO_RTP', 40100),
  ]);
  expect(report.calls[0]!.measurements.firstAudioRtpObservedMs).toBeUndefined();
  expect(report.calls[0]!.statsReadFailed).toBe(true);
  expect(report.calls[0]!.timedOut).toEqual(['REMOTE_AUDIO_RTP_TIMEOUT']);
  expect(report.calls[0]!.endedBy).toBe('APP_STARTED');
});

test('bounded parser ignores malformed and unrelated raw data without echoing it', () => {
  const input = [
    event('REMOTE_AUDIO_RTP', 1500),
    { ...event('ANSWER_ACCEPTED', 1000), address: 'private-address', id: 'private-call-id' },
    { stage: 'private-address', at: 2 },
    event('AUDIO_ACTIVATED', -1),
    null,
  ];
  const report = analyzeCallTimings(input);
  expect(report.invalidEventCount).toBe(3);
  expect(report.calls[0]!.measurements.firstAudioRtpObservedMs).toBe(500);
  expect(JSON.stringify(report)).not.toContain('private-');
  expect(input[0]!.stage).toBe('REMOTE_AUDIO_RTP');
  expect(() => analyzeCallTimings({})).toThrow('bounded array');
  expect(() => analyzeCallTimings(Array(20001))).toThrow('bounded array');
});
