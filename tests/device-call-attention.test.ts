import { DeviceCalls } from '@/messenger/calls';
import type { DeviceMessenger } from '@/messenger/engine';
import type { PeerMesh } from '@/messenger/peer-mesh';
import { captureCall } from '@/messenger/call-platform';
jest.mock('@/messenger/call-platform', () => ({
  captureCall: jest.fn(async () => ({ getTracks: () => [] })),
  stopCallAudio: jest.fn(async () => undefined),
  speakerOutput: jest.fn(),
  switchCallCamera: jest.fn(),
}));
jest.mock('@/messenger/crypto', () => ({ directChatId: () => 'development-chat' }));
function runtime(signaling?: import('@/messenger/calls').CallSignaling) {
  const recordCall = jest.fn(async () => undefined);
  const engine = {
    acceptsPeer: async () => true,
    currentIdentity: () => ({ key: 'own' }),
    recordCall,
  } as unknown as DeviceMessenger;
  const mesh = {
    send: jest.fn(() => true),
    online: () => true,
    endMedia: jest.fn(),
  } as unknown as PeerMesh;
  const calls = new DeviceCalls(engine, mesh, () => 'outgoing-id', signaling);
  return { calls, mesh, recordCall };
}
test('a different trusted peer cannot end the current native call using its ID', async () => {
  const { calls } = runtime();
  const control = jest.fn();
  const stop = calls.observeControl(control);
  await calls.receive('peer', {
    type: 'call',
    id: 'incoming-id',
    action: 'invite',
    media: 'voice',
  });
  await calls.receive('other-peer', {
    type: 'call',
    id: 'incoming-id',
    action: 'end',
    media: 'voice',
  });
  expect(control).not.toHaveBeenCalled();
  expect(calls.snapshot()?.status).toBe('incoming');
  stop();
  calls.stop();
});
test('durable call signaling can invite and accept without opening a message data channel', async () => {
  const send = jest.fn(async () => undefined);
  const outgoing = runtime({ send }),
    incoming = runtime({ send });
  outgoing.mesh.online = () => false;
  incoming.mesh.online = () => false;
  jest.mocked(outgoing.mesh.send).mockReturnValue(false);
  jest.mocked(incoming.mesh.send).mockReturnValue(false);
  try {
    await outgoing.calls.start('peer', 'voice');
    expect(outgoing.calls.snapshot()?.status).toBe('ringing');
    await incoming.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'voice',
    });
    await incoming.calls.accept();
    expect(incoming.calls.snapshot()?.status).toBe('connecting');
    expect(send).toHaveBeenCalledWith('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'accept',
      media: 'voice',
    });
    expect(outgoing.mesh.send).not.toHaveBeenCalled();
    expect(incoming.mesh.send).not.toHaveBeenCalled();
  } finally {
    outgoing.calls.stop();
    incoming.calls.stop();
  }
});
test('failed durable acceptance is an explicit failed call, never a falsely connected one', async () => {
  const incoming = runtime({
    send: async () => {
      throw new Error('FIXTURE_STORAGE_FAILED');
    },
  });
  try {
    await incoming.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'voice',
    });
    await incoming.calls.accept();
    expect(incoming.calls.snapshot()?.status).toBe('failed');
    expect(incoming.mesh.send).not.toHaveBeenCalled();
  } finally {
    incoming.calls.stop();
  }
});
test('late capture failure from an ended call does not terminate a new incoming call', async () => {
  let reject!: (error: Error) => void;
  const delayed = new Promise<MediaStream>((_resolve, fail) => {
    reject = fail;
  });
  jest.mocked(captureCall).mockImplementationOnce(() => delayed);
  const { calls } = runtime();
  const pending = calls.start('peer', 'voice');
  await Promise.resolve();
  await calls.end();
  await calls.receive('second-peer', {
    type: 'call',
    id: 'new-call',
    action: 'invite',
    media: 'voice',
  });
  reject(new Error('PERMISSION_DENIED'));
  await expect(pending).rejects.toThrow('PERMISSION_DENIED');
  expect(calls.snapshot()?.id).toBe('new-call');
  expect(calls.snapshot()?.status).toBe('incoming');
  calls.stop();
});
test('withdrawn incoming invite records one missed call and repeated invites never reject a ringing call', async () => {
  const { calls, mesh, recordCall } = runtime();
  const invite = { type: 'call', id: 'incoming-id', action: 'invite', media: 'voice' } as const;
  await calls.receive('peer', invite);
  await calls.receive('peer', invite);
  expect(mesh.send).not.toHaveBeenCalled();
  await calls.receive('peer', { ...invite, action: 'end' });
  await calls.receive('peer', { ...invite, action: 'end' });
  expect(recordCall).toHaveBeenCalledTimes(1);
  expect(recordCall).toHaveBeenCalledWith(
    'development-chat',
    'incoming-id',
    'peer',
    'voice',
    'missed',
    'incoming',
  );
  calls.stop();
});
test('deliberately declining an incoming call is not missed', async () => {
  const { calls, recordCall } = runtime();
  await calls.receive('peer', {
    type: 'call',
    id: 'incoming-id',
    action: 'invite',
    media: 'video',
  });
  await calls.end();
  expect(recordCall).toHaveBeenCalledWith(
    'development-chat',
    'incoming-id',
    'peer',
    'video',
    'declined',
    'incoming',
  );
  calls.stop();
});
test('ring timeout distinguishes incoming missed calls from outgoing unanswered calls', async () => {
  jest.useFakeTimers();
  const incoming = runtime();
  const outgoing = runtime();
  try {
    await incoming.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'voice',
    });
    await outgoing.calls.start('peer', 'voice');
    await jest.advanceTimersByTimeAsync(60000);
    expect(incoming.recordCall).toHaveBeenCalledWith(
      'development-chat',
      'incoming-id',
      'peer',
      'voice',
      'missed',
      'incoming',
    );
    expect(outgoing.recordCall).toHaveBeenCalledWith(
      'development-chat',
      'outgoing-id',
      'peer',
      'voice',
      'unanswered',
      'outgoing',
    );
  } finally {
    incoming.calls.stop();
    outgoing.calls.stop();
    jest.useRealTimers();
  }
});
