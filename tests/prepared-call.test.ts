import { PreparedCall, isDataOnlyDescription } from '../src/messenger/prepared-call';
import type { Signal } from '../src/messenger/signaling';

const dataSDP =
  'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\na=sctp-port:5000\r\n';
const audioSDP = dataSDP + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:1\r\n';
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function fixture(incoming = true) {
  const channel = Object.assign(new EventTarget(), {
    label: 'mnelo-call-ready-v1',
    readyState: 'open',
    bufferedAmount: 0,
    send: jest.fn(),
    close: jest.fn(),
  });
  const peer = Object.assign(new EventTarget(), {
    connectionState: 'connected',
    signalingState: 'stable',
    iceGatheringState: 'complete',
    localDescription: null as RTCSessionDescriptionInit | null,
    remoteDescription: null as RTCSessionDescriptionInit | null,
    addTrack: jest.fn(),
    getSenders: jest.fn(() => []),
    createDataChannel: jest.fn(() => channel),
    createOffer: jest.fn(async () => ({ type: 'offer', sdp: dataSDP })),
    createAnswer: jest.fn(async () => ({ type: 'answer', sdp: dataSDP })),
    addIceCandidate: jest.fn(async () => {}),
    close: jest.fn(),
    setRemoteDescription: jest.fn(async (value: RTCSessionDescriptionInit) => {
      peer.remoteDescription = value;
      peer.signalingState = value.type === 'offer' ? 'have-remote-offer' : 'stable';
    }),
    setLocalDescription: jest.fn(async (value: RTCSessionDescriptionInit) => {
      peer.localDescription = value;
      peer.signalingState = value.type === 'offer' ? 'have-local-offer' : 'stable';
    }),
  });
  let allowed = true,
    consent = false;
  const hooks = {
    valid: () => allowed,
    consent: () => consent,
    send: jest.fn(async () => ({ payload: '', signature: '' })),
    signal: jest.fn(async () => {}),
    control: jest.fn(async () => {}),
    remote: jest.fn(),
    state: jest.fn(),
    connected: jest.fn(),
    failed: jest.fn(),
  };
  const call = new PreparedCall(peer as unknown as RTCPeerConnection, incoming, hooks);
  if (incoming) peer.dispatchEvent(Object.assign(new Event('datachannel'), { channel }));
  const signal = (
    preparation: 'transport' | 'media',
    sdp = preparation === 'transport' ? dataSDP : audioSDP,
  ): Signal => ({
    protocol: 'mnelo-dtls-v1',
    purpose: 'call',
    preparation,
    from: 'a',
    to: 'b',
    session: 'fixture',
    expires: Date.now() + 60_000,
    type: incoming ? 'offer' : 'answer',
    sdp,
  });
  return {
    peer,
    channel,
    hooks,
    call,
    signal,
    consent: () => {
      consent = true;
    },
    cancel: () => {
      allowed = false;
      call.close();
    },
  };
}

test('preparation strictly permits data only, including rejected/disabled media m-lines', () => {
  expect(isDataOnlyDescription(dataSDP)).toBe(true);
  for (const sdp of [
    audioSDP,
    dataSDP + 'm=video 0 UDP/TLS/RTP/SAVPF 96\r\na=inactive\r\n',
    dataSDP + 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
    'v=0\r\n',
  ])
    expect(isDataOnlyDescription(sdp)).toBe(false);
});

test('connected data transport does not answer, attach media or expose incoming tracks before consent', async () => {
  const f = fixture();
  try {
    f.call.receive(f.signal('transport'));
    await turn();
    expect(f.call.ready()).toBe(true);
    expect(f.peer.addTrack).not.toHaveBeenCalled();
    f.peer.dispatchEvent(new Event('connectionstatechange'));
    f.peer.dispatchEvent(
      Object.assign(new Event('track'), { track: { kind: 'audio' }, streams: [{}] }),
    );
    expect(f.hooks.connected).not.toHaveBeenCalled();
    expect(f.hooks.remote).not.toHaveBeenCalled();
    f.call.receive(f.signal('media'));
    await turn();
    expect(f.peer.setRemoteDescription).toHaveBeenCalledTimes(1);
  } finally {
    f.cancel();
  }
});

test('forged media-bearing preparation is rejected before setRemoteDescription', async () => {
  const f = fixture();
  try {
    f.call.receive(f.signal('transport', audioSDP));
    await turn();
    expect(f.peer.setRemoteDescription).not.toHaveBeenCalled();
  } finally {
    f.cancel();
  }
});

test('an offer overtaking recipient capture waits locally, then connects without another mailbox signal', async () => {
  const f = fixture();
  try {
    f.call.receive(f.signal('transport'));
    await turn();
    f.consent();
    expect(f.call.select(true)).toBe(true);
    f.call.receive(f.signal('media'));
    await turn();
    expect(f.peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(f.hooks.connected).not.toHaveBeenCalled();
    f.peer.createAnswer.mockResolvedValue({ type: 'answer', sdp: audioSDP });
    const stream = { getTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream;
    await f.call.activate(stream);
    await turn();
    expect(f.peer.addTrack).toHaveBeenCalledTimes(1);
    expect(f.hooks.connected).toHaveBeenCalledTimes(1);
    f.call.receive(f.signal('transport'));
    await turn();
    expect(f.peer.remoteDescription?.sdp).toBe(audioSDP);
    expect(f.hooks.connected).toHaveBeenCalledTimes(1);
  } finally {
    f.cancel();
  }
});

test('reordered, duplicated answer and resume cannot create a second media offer or reset the call clock', async () => {
  const f = fixture(false);
  try {
    await f.call.offer();
    f.call.receive(f.signal('transport'));
    await turn();
    f.consent();
    expect(f.call.select(false)).toBe(true);
    f.peer.createOffer.mockResolvedValue({ type: 'offer', sdp: audioSDP });
    const stream = { getTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream;
    await f.call.activate(stream);
    await f.call.activate(stream);
    f.call.receive(f.signal('media'));
    await turn();
    f.call.receive(f.signal('media'));
    await turn();
    expect(f.peer.createOffer).toHaveBeenCalledTimes(2);
    expect(f.peer.addTrack).toHaveBeenCalledTimes(1);
    expect(f.hooks.connected).toHaveBeenCalledTimes(1);
  } finally {
    f.cancel();
  }
});

test('hangup during capture cannot attach tracks, publish media or resurrect the call', async () => {
  const f = fixture();
  f.call.receive(f.signal('transport'));
  await turn();
  f.consent();
  expect(f.call.select(true)).toBe(true);
  f.call.receive(f.signal('media'));
  await turn();
  f.cancel();
  await f.call.activate({ getTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream);
  await turn();
  expect(f.peer.addTrack).not.toHaveBeenCalled();
  expect(f.hooks.connected).not.toHaveBeenCalled();
  expect(f.peer.close).toHaveBeenCalledTimes(1);
});

test('expired descriptions and unavailable data paths cannot be selected', async () => {
  const f = fixture();
  try {
    f.call.receive({ ...f.signal('transport'), expires: Date.now() - 1 });
    await turn();
    expect(f.peer.setRemoteDescription).not.toHaveBeenCalled();
    f.channel.readyState = 'connecting';
    expect(f.call.select(true)).toBe(false);
    expect(f.call.select(false)).toBe(false);
  } finally {
    f.cancel();
  }
});

test('native candidate callback during media negotiation cannot publish the old data-only SDP as a media offer', async () => {
  const f = fixture(false);
  try {
    await f.call.offer();
    f.call.receive(f.signal('transport'));
    await turn();
    f.consent();
    expect(f.call.select(false)).toBe(true);
    f.hooks.send.mockClear();
    f.peer.createOffer.mockImplementationOnce(async () => {
      f.peer.dispatchEvent(new Event('icecandidate'));
      await turn();
      return { type: 'offer', sdp: audioSDP };
    });
    await f.call.activate({ getTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream);
    const calls = f.hooks.send.mock.calls as unknown as [string, string, string][];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['media', 'offer', audioSDP]);
  } finally {
    f.cancel();
  }
});

test('a quick authenticated acceptance reuses the outstanding data offer and waits for its answer before adding an offer', async () => {
  const f = fixture(false);
  try {
    await f.call.offer();
    f.channel.readyState = 'connecting';
    f.peer.connectionState = 'connecting';
    f.consent();
    expect(f.call.select(false)).toBe(true);
    f.peer.createOffer.mockResolvedValue({ type: 'offer', sdp: audioSDP });
    const stream = { getTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream;
    await f.call.activate(stream);
    expect(f.peer.createOffer).toHaveBeenCalledTimes(1);
    f.call.receive(f.signal('transport'));
    await turn();
    await turn();
    expect(f.peer.createOffer).toHaveBeenCalledTimes(2);
    expect(f.peer.addTrack).toHaveBeenCalledTimes(1);
    expect(f.hooks.connected).not.toHaveBeenCalled();
    f.call.receive(f.signal('media'));
    await turn();
    f.peer.connectionState = 'connected';
    f.peer.dispatchEvent(new Event('connectionstatechange'));
    expect(f.hooks.connected).toHaveBeenCalledTimes(1);
  } finally {
    f.cancel();
  }
});
