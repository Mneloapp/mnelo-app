import { connectionTiming } from './connection-timing';

// Observe packet/decoder readiness separately from ICE/DTLS connected. This
// changes no call state and logs no statistics objects, candidate addresses or IDs.
export function observeMediaTiming(peer: RTCPeerConnection, video: boolean) {
  let stopped = false,
    attempts = 0,
    audio = false,
    decoded = !video,
    encoded = !video;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    if (stopped || typeof peer.getStats !== 'function') return;
    try {
      const report = await peer.getStats();
      if (stopped) return;
      report.forEach((row) => {
        const kind = row.kind ?? row.mediaType;
        if (row.type === 'inbound-rtp' && kind === 'audio' && row.packetsReceived > 0 && !audio) {
          audio = true;
          connectionTiming('REMOTE_AUDIO_RTP');
        }
        if (row.type === 'inbound-rtp' && kind === 'video' && row.framesDecoded > 0 && !decoded) {
          decoded = true;
          connectionTiming('REMOTE_VIDEO_DECODED');
        }
        if (row.type === 'outbound-rtp' && kind === 'video' && row.framesEncoded > 0 && !encoded) {
          encoded = true;
          connectionTiming('LOCAL_VIDEO_ENCODED');
        }
      });
    } catch {
      /* A peer can close while getStats crosses the native bridge. */
    }
    if (!stopped && !(audio && decoded && encoded) && ++attempts < 20)
      timer = setTimeout(() => void poll(), 500);
  };
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
