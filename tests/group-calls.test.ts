import { DeviceCalls, type CallControl } from '@/messenger/calls';
import type { DeviceMessenger } from '@/messenger/engine';
import type { PeerMesh } from '@/messenger/peer-mesh';
import { packetSchema } from '@/messenger/model';
import { captureCall } from '@/messenger/call-platform';
jest.mock('@/messenger/capture-screen', () => ({ captureScreen: jest.fn() }));
jest.mock('@/messenger/crypto', () => ({
  directChatId: (a: string, b: string) => [a, b].sort().join(':'),
}));
jest.mock('@/messenger/call-platform', () => ({
  captureCall: jest.fn(),
  stopCallAudio: jest.fn(async () => {}),
  speakerOutput: jest.fn(),
  switchCallCamera: jest.fn(),
}));
const keys = ['a', 'b', 'c', 'd'].map((value) => value.repeat(64));
const id = 'c7d466c3-0000-4000-8000-000000000001';
function stream() {
  const audio = { stop: jest.fn(), enabled: true },
    video = { stop: jest.fn(), enabled: true };
  return {
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
}
function setup() {
  const queued: { from: string; to: string; control: CallControl }[] = [];
  const offers: { from: string; to: string; id: string; local: MediaStream }[] = [];
  const linked = new Set<string>();
  const nodes = keys.slice(0, 3).map((key) => {
    const engine = {
      currentIdentity: () => ({ key }),
      acceptsPeer: async (peer: string) => keys.slice(0, 3).includes(peer),
      chat: async () => ({ kind: 'group', left_group: 0 }),
      members: async () => keys.slice(0, 3).map((key) => ({ key })),
      recordCall: jest.fn(async () => {}),
      send: jest.fn(async () => 'reply-id'),
      flush: jest.fn(async () => {}),
    };
    const mesh = {
      calls: null as DeviceCalls | null,
      endMedia: jest.fn(),
      startMedia: jest.fn(async (peer: string, call: string, local: MediaStream) => {
        offers.push({ from: key, to: peer, id: call, local });
      }),
    };
    const calls = new DeviceCalls(
      engine as unknown as DeviceMessenger,
      mesh as unknown as PeerMesh,
      () => id,
      {
        send: async (to, control) => {
          queued.push({ from: key, to, control });
        },
      },
    );
    return { key, calls, mesh, engine };
  });
  async function deliver() {
    let count = 0;
    while (queued.length || offers.length) {
      if (++count > 100) throw new Error('control loop');
      if (queued.length) {
        const next = queued.shift()!;
        await nodes.find((node) => node.key === next.to)!.calls.receive(next.from, next.control);
      } else {
        const next = offers.shift()!;
        const from = nodes.find((node) => node.key === next.from)!,
          to = nodes.find((node) => node.key === next.to)!;
        expect(to.calls.allowedOffer(next.from, next.id)).toBeTruthy();
        expect(from.calls.allowedAnswer(next.to, next.id)).toBe(true);
        linked.add([next.from, next.to].sort().join(':'));
        from.calls.remote(next.to, next.id, stream());
        to.calls.remote(next.from, next.id, next.local);
        from.calls.connected(next.to, next.id);
        to.calls.connected(next.from, next.id);
      }
    }
  }
  return { nodes, queued, linked, deliver };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(captureCall).mockImplementation(async () => stream());
});
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});
test.each(['voice', 'video'] as const)(
  'three people establish a %s mesh; leaving the host does not end the other pair',
  async (media) => {
    const { nodes, linked, deliver } = setup();
    const a = nodes[0]!,
      b = nodes[1]!,
      c = nodes[2]!;
    try {
      await a.calls.startGroup('group', [b.key, c.key], media);
      await deliver();
      expect(b.calls.snapshot()?.status).toBe('incoming');
      expect(c.calls.snapshot()?.local).toBeNull();
      await b.calls.accept();
      await deliver();
      expect(linked.size).toBe(1);
      await c.calls.accept();
      await deliver();
      expect(linked.size).toBe(3);
      for (const node of nodes) expect(node.calls.snapshot()?.status).toBe('active');
      await a.calls.end();
      await deliver();
      expect(b.calls.snapshot()?.status).toBe('active');
      expect(c.calls.snapshot()?.status).toBe('active');
      expect(b.calls.snapshot()?.participants?.find((p) => p.peer === a.key)?.status).toBe('left');
      await b.calls.end();
      await deliver();
      expect(c.calls.snapshot()?.status).toBe('ended');
      for (const node of nodes) expect(node.engine.recordCall).toHaveBeenCalledTimes(1);
    } finally {
      nodes.forEach((node) => node.calls.stop());
    }
  },
);
test('a participant may decline without cancelling everybody else; repeated invites cannot revive it', async () => {
  const { nodes, deliver, queued } = setup();
  const a = nodes[0]!,
    b = nodes[1]!,
    c = nodes[2]!;
  try {
    await a.calls.startGroup('group', [b.key, c.key], 'video');
    const invite = queued.find((q) => q.to === c.key)!;
    await deliver();
    await c.calls.end();
    await deliver();
    expect(a.calls.snapshot()?.status).toBe('ringing');
    await b.calls.accept();
    await deliver();
    expect(a.calls.snapshot()?.status).toBe('active');
    await c.calls.receive(a.key, invite.control);
    expect(c.calls.snapshot()?.status).toBe('ended');
  } finally {
    nodes.forEach((node) => node.calls.stop());
  }
});
test('outsiders, mismatched rosters and non-host invitations cannot authorize capture', async () => {
  const { nodes } = setup();
  const a = nodes[0]!,
    b = nodes[1]!,
    c = nodes[2]!;
  const group = { chat: 'group', host: a.key, participants: [a.key, b.key, c.key] };
  const control = { type: 'call', id, action: 'invite', media: 'video', group } as const;
  try {
    await b.calls.receive(c.key, control);
    expect(b.calls.snapshot()).toBeNull();
    await b.calls.receive(a.key, {
      ...control,
      group: { ...group, participants: [a.key, b.key, keys[3]!] },
    });
    expect(b.calls.snapshot()).toBeNull();
    expect(captureCall).not.toHaveBeenCalled();
    expect(
      packetSchema.safeParse({
        ...control,
        group: { ...group, participants: [a.key, b.key, b.key] },
      }).success,
    ).toBe(false);
  } finally {
    nodes.forEach((node) => node.calls.stop());
  }
});

test('quick reply commits a private message before declining, never captures media, and rejects an old call', async () => {
  const f = setup();
  const caller = f.nodes[0]!,
    receiver = f.nodes[1]!;
  await receiver.calls.receive(caller.key, { type: 'call', action: 'invite', id, media: 'voice' });
  expect(receiver.calls.snapshot()?.status).toBe('incoming');
  await receiver.calls.replyAndDecline(id, '  In a meeting  ');
  expect(receiver.engine.send).toHaveBeenCalledWith(
    [caller.key, receiver.key].sort().join(':'),
    'In a meeting',
    { deferDelivery: true },
  );
  expect(receiver.calls.snapshot()?.status).toBe('ended');
  expect(receiver.engine.flush).toHaveBeenCalledWith(undefined, 'reply-id');
  await expect(receiver.calls.replyAndDecline(id, 'Again')).rejects.toThrow('CALL_UNAVAILABLE');
  expect(receiver.engine.send).toHaveBeenCalledTimes(1);
});
