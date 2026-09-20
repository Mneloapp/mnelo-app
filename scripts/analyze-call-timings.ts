import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { MEDIA_TIMING_INTERVAL_MS, MEDIA_TIMING_WINDOW_MS } from '../src/messenger/media-timing';

type Event = { stage: string; at: number; duration?: number };
const measurements = {
  ANSWER_ACTION: 'nativeAnswerActionMs',
  ANSWER_ACCEPTED: 'javascriptAnswerHandlerMs',
  CAPTURE_INCOMING_READY: 'captureReadyMs',
  AUDIO_ACTIVATED: 'audioSessionActivatedMs',
  MEDIA_TRANSPORT_CONNECTED: 'transportConnectedMs',
  CALL_PREPARED_CHANNEL_OPEN: 'preparedChannelOpenMs',
  CALL_PREPARED_MEDIA_READY: 'preparedMediaReadyMs',
  REMOTE_AUDIO_RTP: 'firstAudioRtpObservedMs',
  REMOTE_VIDEO_DECODED: 'firstVideoDecodedObservedMs',
  REMOTE_VIDEO_FRAME: 'firstVideoRendererEventMs',
  LOCAL_VIDEO_ENCODED: 'firstLocalVideoEncodedObservedMs',
} as const;
type Measurement = (typeof measurements)[keyof typeof measurements];
type Call = {
  acceptance: 'native-answer-action' | 'local-answer-handler' | 'remote-accept-received';
  acceptedAt: number;
  measurements: Partial<Record<Measurement, number>>;
  statsStarted: boolean;
  statsUnavailable: boolean;
  statsReadFailed: boolean;
  timedOut: string[];
  endedBy: string | null;
  endedAfterMs: number | null;
};
const boundaries = new Set([
  'APP_STARTED',
  'CAPTURE_OUTGOING',
  'CALL_ENDED',
  'CALL_FAILED',
  'CALL_STOPPED',
]);
const timeouts = new Set([
  'REMOTE_AUDIO_RTP_TIMEOUT',
  'REMOTE_VIDEO_DECODE_TIMEOUT',
  'LOCAL_VIDEO_ENCODE_TIMEOUT',
]);

export function analyzeCallTimings(input: unknown) {
  if (!Array.isArray(input) || input.length > 20000)
    throw new Error('Expected a bounded array of timing events');
  const events = input
    .filter((value): value is Event => {
      if (!value || typeof value !== 'object') return false;
      const event = value as Partial<Event>;
      return (
        typeof event.stage === 'string' &&
        /^[A-Z_]{1,48}$/.test(event.stage) &&
        typeof event.at === 'number' &&
        Number.isFinite(event.at) &&
        event.at >= 0
      );
    })
    .sort((a, b) => a.at - b.at);
  const calls: Call[] = [];
  let call: Call | undefined;
  let activation: number | undefined;
  let preparation: number | undefined;
  for (const event of events) {
    if (boundaries.has(event.stage)) {
      if (call) {
        call.endedBy = event.stage;
        call.endedAfterMs = event.at - call.acceptedAt;
      }
      call = undefined;
      activation = undefined;
      preparation = undefined;
      continue;
    }
    if (event.stage === 'AUDIO_ACTIVATED') activation = event.at;
    if (event.stage === 'CALL_PREPARED_CHANNEL_OPEN') preparation = event.at;
    if (
      event.stage === 'ANSWER_ACTION' ||
      event.stage === 'ANSWER_ACCEPTED' ||
      event.stage === 'REMOTE_ACCEPT_RECEIVED'
    ) {
      // The foreground answer handler precedes its programmatic CallKit answer;
      // a lock-screen CallKit answer can precede JS startup by seconds. Keep the
      // earliest marker and attach the other side, without creating a second call.
      const localMeasurement =
        event.stage === 'ANSWER_ACTION'
          ? 'nativeAnswerActionMs'
          : event.stage === 'ANSWER_ACCEPTED'
            ? 'javascriptAnswerHandlerMs'
            : undefined;
      if (
        call &&
        call.acceptance !== 'remote-accept-received' &&
        localMeasurement &&
        call.measurements[localMeasurement] === undefined
      ) {
        call.measurements[localMeasurement] = event.at - call.acceptedAt;
        continue;
      }
      if (call) {
        call.endedBy = 'NEXT_ACCEPTANCE';
        call.endedAfterMs = event.at - call.acceptedAt;
        activation = undefined;
        preparation = undefined;
      }
      call = {
        acceptance:
          event.stage === 'ANSWER_ACTION'
            ? 'native-answer-action'
            : event.stage === 'ANSWER_ACCEPTED'
              ? 'local-answer-handler'
              : 'remote-accept-received',
        acceptedAt: event.at,
        measurements: {
          ...(activation === undefined ? {} : { audioSessionActivatedMs: activation - event.at }),
          ...(preparation === undefined ? {} : { preparedChannelOpenMs: preparation - event.at }),
        },
        statsStarted: false,
        statsUnavailable: false,
        statsReadFailed: false,
        timedOut: [],
        endedBy: null,
        endedAfterMs: null,
      };
      if (localMeasurement) call.measurements[localMeasurement] = 0;
      calls.push(call);
      continue;
    }
    if (!call) continue;
    if (event.stage === 'MEDIA_STATS_STARTED') call.statsStarted = true;
    if (event.stage === 'MEDIA_STATS_UNAVAILABLE') call.statsUnavailable = true;
    if (event.stage === 'MEDIA_STATS_READ_FAILED') call.statsReadFailed = true;
    if (timeouts.has(event.stage) && !call.timedOut.includes(event.stage))
      call.timedOut.push(event.stage);
    const name = measurements[event.stage as keyof typeof measurements];
    if (name && call.measurements[name] === undefined)
      call.measurements[name] = event.at - call.acceptedAt;
  }
  return {
    statsSamplingIntervalMs: MEDIA_TIMING_INTERVAL_MS,
    statsObservationWindowMs: MEDIA_TIMING_WINDOW_MS,
    invalidEventCount: input.length - events.length,
    limitations: [
      'Each report uses one device clock. Separate phones and group participants cannot be paired because identifiers are not recorded.',
      'Local acceptance uses the earliest native CallKit answer action or JavaScript answer handler. The native action is a callback after the tap, not the physical tap timestamp. Remote acceptance means receipt of its encrypted control, not the other person’s tap.',
      'RTP and decoded-frame times are first positive statistics observations, sampled every 500 ms plus native bridge/event-loop delay; they are not exact packet/frame arrival timestamps.',
      'Audio RTP does not prove audible playback. AUDIO_ACTIVATED is the operating-system session callback, not an acoustic measurement. A negative activation offset means the callback preceded the earliest local acceptance marker.',
      'The renderer event reports non-clearing video dimensions; it does not measure when a person saw a displayed frame.',
      'A negative prepared-channel offset means the data-only connection was ready before acceptance. Prepared media readiness is completion of post-consent negotiation on that connection, not an acoustic measurement.',
      'Missing measurements remain absent. A timeout or unavailable statistics does not prove that no media arrived. Old or truncated traces without an acceptance marker cannot measure answer-to-media latency.',
    ],
    calls,
  };
}

if (process.argv[1] && /(?:^|[/\\])analyze-call-timings\.(?:ts|js)$/.test(process.argv[1])) {
  try {
    const paths = process.argv.slice(2);
    if (!paths.length)
      throw new Error('Usage: npx tsx scripts/analyze-call-timings.ts <timings.json> [...]');
    const reports = paths.map((path) => {
      if (statSync(path).size > 8 * 1024 * 1024) throw new Error('Timing trace exceeds 8 MiB');
      return {
        source: basename(path),
        ...analyzeCallTimings(JSON.parse(readFileSync(path, 'utf8'))),
      };
    });
    process.stdout.write(JSON.stringify(reports, null, 2) + '\n');
  } catch {
    process.stderr.write(
      'Could not analyze timing trace. Supply a readable JSON array (up to 8 MiB).\n',
    );
    process.exitCode = 1;
  }
}
