// Send a usable TURN path promptly; a slow/unreachable fallback TURN transport
// must not delay both halves of the offer/answer handshake by ten seconds each.
export function gatherCallCandidates(peer: RTCPeerConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      clearTimeout(deadline);
      clearTimeout(settle);
      peer.removeEventListener('icecandidate', update);
      peer.removeEventListener('icegatheringstatechange', update);
      peer.removeEventListener('connectionstatechange', update);
      if (error) reject(error);
      else resolve();
    };
    const update = () => {
      if (peer.connectionState === 'closed') finish(new Error('CALL_CANCELLED'));
      else if (peer.iceGatheringState === 'complete') finish();
      else if (
        !settle &&
        /^a=candidate:.* typ relay(?: |\r?$)/m.test(peer.localDescription?.sdp ?? '')
      )
        settle = setTimeout(() => finish(), 200);
    };
    const deadline = setTimeout(() => finish(new Error('ICE_TIMEOUT')), 10000);
    peer.addEventListener('icecandidate', update);
    peer.addEventListener('icegatheringstatechange', update);
    peer.addEventListener('connectionstatechange', update);
    update();
  });
}

function description(sdp: string) {
  const lines = sdp.split(/\r?\n/);
  const binding = lines
    .filter((line) => /^(m=|a=(mid|fingerprint|ice-ufrag|ice-pwd|setup):)/.test(line))
    .join('\n');
  const sections = sdp.split(/\r?\nm=/).slice(1);
  const candidates = sections.flatMap((section, sdpMLineIndex) => {
    const lines = section.split(/\r?\n/);
    const sdpMid = lines.find((line) => line.startsWith('a=mid:'))?.slice(6);
    return lines
      .filter((line) => line.startsWith('a=candidate:'))
      .map((line) => ({
        candidate: line.slice(2),
        sdpMLineIndex,
        ...(sdpMid ? { sdpMid } : {}),
      }));
  });
  return { binding, candidates };
}

// Later signed SDP contains the remaining candidates. Older clients can use the
// first complete offer/answer unchanged; newer clients add the fallback paths
// without renegotiating tracks or resetting DTLS/ICE credentials.
export async function addCallCandidates(peer: RTCPeerConnection, sdp: string) {
  if (!peer.remoteDescription?.sdp) return;
  const current = description(peer.remoteDescription.sdp),
    next = description(sdp);
  if (current.binding !== next.binding) throw new Error('CALL_SIGNAL_INVALID');
  const known = new Set(current.candidates.map((candidate) => JSON.stringify(candidate)));
  for (const candidate of next.candidates) {
    if (!known.has(JSON.stringify(candidate))) {
      await peer.addIceCandidate(candidate);
      known.add(JSON.stringify(candidate));
    }
  }
}
