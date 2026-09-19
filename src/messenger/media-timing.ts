import { connectionTiming } from './connection-timing';

export const MEDIA_TIMING_INTERVAL_MS = 500;
export const MEDIA_TIMING_WINDOW_MS = 30000;

// Observe packet/decoder readiness separately from ICE/DTLS connected. This
// changes no call state and logs no statistics objects, candidate addresses or IDs.
// RTP arrival is evidence of received packets, not evidence of audible playback.
export function observeMediaTiming(peer: RTCPeerConnection, video: boolean) {
  let stopped = false,
    audio = false,
    decoded = !video,
    encoded = !video,
    readFailed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
  };
  if (typeof peer.getStats !== 'function') {
    connectionTiming('MEDIA_STATS_UNAVAILABLE');
    return stop;
  }
  const positive = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  const poll = async () => {
    if (stopped) return;
    try {
      const report = await peer.getStats();
      if (stopped) return;
      report.forEach((row) => {
        const kind = row.kind ?? row.mediaType;
        if (
          row.type === 'inbound-rtp' &&
          kind === 'audio' &&
          positive(row.packetsReceived) &&
          !audio
        ) {
          audio = true;
          connectionTiming('REMOTE_AUDIO_RTP');
        }
        if (
          row.type === 'inbound-rtp' &&
          kind === 'video' &&
          positive(row.framesDecoded) &&
          !decoded
        ) {
          decoded = true;
          connectionTiming('REMOTE_VIDEO_DECODED');
        }
        if (
          row.type === 'outbound-rtp' &&
          kind === 'video' &&
          positive(row.framesEncoded) &&
          !encoded
        ) {
          encoded = true;
          connectionTiming('LOCAL_VIDEO_ENCODED');
        }
      });
    } catch {
      // A peer can close while getStats crosses the native bridge. Keep this
      // diagnostic separate from missing media, and bound repeated failures.
      if (!stopped && !readFailed) {
        readFailed = true;
        connectionTiming('MEDIA_STATS_READ_FAILED');
      }
    }
    if (!stopped && audio && decoded && encoded) stop();
    else if (!stopped) timer = setTimeout(() => void poll(), MEDIA_TIMING_INTERVAL_MS);
  };
  connectionTiming('MEDIA_STATS_STARTED', MEDIA_TIMING_INTERVAL_MS);
  // A native getStats promise may never settle. A separate deadline keeps that
  // case bounded and makes an incomplete observation explicit in USB traces.
  deadline = setTimeout(() => {
    if (!audio) connectionTiming('REMOTE_AUDIO_RTP_TIMEOUT');
    if (!decoded) connectionTiming('REMOTE_VIDEO_DECODE_TIMEOUT');
    if (!encoded) connectionTiming('LOCAL_VIDEO_ENCODE_TIMEOUT');
    stop();
  }, MEDIA_TIMING_WINDOW_MS);
  void poll();
  return stop;
}
