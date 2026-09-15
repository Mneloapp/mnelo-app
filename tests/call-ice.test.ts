import { gatherCallCandidates, addCallCandidates } from '@/messenger/call-ice';

const relay = 'candidate:1 1 udp 100 192.0.2.1 4000 typ relay raddr 0.0.0.0 rport 0';
const fallback = 'candidate:2 1 udp 90 192.0.2.2 4001 typ relay raddr 0.0.0.0 rport 0';
const sdp = (candidates: string[]) =>
  [
    'v=0',
    'a=fingerprint:sha-256 ' + Array(32).fill('AA').join(':'),
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=mid:0',
    'a=ice-ufrag:peer',
    'a=ice-pwd:secret',
    ...candidates.map((value) => 'a=' + value),
    '',
  ].join('\r\n');
function fixture() {
  const listeners = new Map<string, Set<() => void>>();
  const peer = {
    connectionState: 'new',
    iceGatheringState: 'gathering',
    localDescription: { sdp: sdp([]) },
    remoteDescription: { sdp: sdp([relay]) },
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    addIceCandidate: jest.fn(async () => {
      peer.remoteDescription.sdp = sdp([relay, fallback]);
    }),
  };
  return {
    peer,
    rtc: peer as unknown as RTCPeerConnection,
    emit: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
    listeners,
  };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('first relay candidate starts setup before an unreachable fallback finishes gathering', async () => {
  const f = fixture();
  let ready = false;
  const operation = gatherCallCandidates(f.rtc).then(() => {
    ready = true;
  });
  await jest.advanceTimersByTimeAsync(500);
  expect(ready).toBe(false);
  f.peer.localDescription.sdp = sdp([relay]);
  f.emit('icecandidate');
  await jest.advanceTimersByTimeAsync(200);
  await operation;
  expect(ready).toBe(true);
  expect(f.peer.iceGatheringState).toBe('gathering');
  expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
test('cancelled gathering stops promptly and never publishes after hangup', async () => {
  const f = fixture();
  const operation = gatherCallCandidates(f.rtc);
  const rejected = expect(operation).rejects.toThrow('CALL_CANCELLED');
  f.peer.connectionState = 'closed';
  f.emit('connectionstatechange');
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
});
test('signed SDP updates add fallback candidates once without resetting the established media session', async () => {
  const f = fixture();
  await addCallCandidates(f.rtc, sdp([relay, fallback]));
  await addCallCandidates(f.rtc, sdp([relay, fallback]));
  expect(f.peer.addIceCandidate).toHaveBeenCalledTimes(1);
  expect(f.peer.addIceCandidate).toHaveBeenCalledWith({
    candidate: fallback,
    sdpMid: '0',
    sdpMLineIndex: 0,
  });
  await expect(
    addCallCandidates(f.rtc, sdp([fallback]).replace('a=ice-ufrag:peer', 'a=ice-ufrag:other')),
  ).rejects.toThrow('CALL_SIGNAL_INVALID');
  expect(f.peer.addIceCandidate).toHaveBeenCalledTimes(1);
});
