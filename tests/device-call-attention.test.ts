import { DeviceCalls } from '@/messenger/calls';
import type { DeviceMessenger } from '@/messenger/engine';
import type { PeerMesh } from '@/messenger/peer-mesh';
import { captureCall, stopCallAudio } from '@/messenger/call-platform';
jest.mock('@/messenger/capture-screen', () => ({ captureScreen: jest.fn() }));
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
test('hangup stops capture and playback before pending signaling finishes, and records only once', async () => {
  let deliver!: () => void;
  const send = jest.fn(async (_peer, control) => {
    if (control.action === 'end')
      await new Promise<void>((resolve) => {
        deliver = resolve;
      });
  });
  const stop = jest.fn();
  jest.mocked(captureCall).mockResolvedValueOnce({
    getTracks: () => [{ stop }],
  } as unknown as MediaStream);
  const { calls, mesh, recordCall } = runtime({ send });
  await calls.start('peer', 'video');
  jest.mocked(stopCallAudio).mockClear();
  const pending = calls.end();
  expect(calls.snapshot()?.status).toBe('ended');
  expect(stop).toHaveBeenCalledTimes(1);
  expect(mesh.endMedia).toHaveBeenCalledWith('peer', 'outgoing-id');
  expect(stopCallAudio).toHaveBeenCalledTimes(1);
  expect(recordCall).toHaveBeenCalledTimes(1);
  await calls.end();
  deliver();
  await pending;
  expect(recordCall).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
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

test('a presented incoming call acknowledges once, while invite delivery alone does not', async () => {
  const ringingReceipt = jest.fn(async () => {});
  const f = runtime({ send: jest.fn(async () => {}), ringingReceipt });
  try {
    await f.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'voice',
    });
    expect(ringingReceipt).not.toHaveBeenCalled();
    await f.calls.confirmIncoming('wrong-id');
    expect(ringingReceipt).not.toHaveBeenCalled();
    await Promise.all([
      f.calls.confirmIncoming('incoming-id'),
      f.calls.confirmIncoming('incoming-id'),
    ]);
    expect(ringingReceipt).toHaveBeenCalledTimes(1);
    expect(ringingReceipt).toHaveBeenCalledWith('peer', 'incoming-id');
    expect(f.calls.snapshot()?.status).toBe('incoming');
  } finally {
    f.calls.stop();
  }
});

test('ringing receipts bind to the current outgoing peer and never undo answer, end, or a later call', async () => {
  const f = runtime({ send: jest.fn(async () => {}) });
  f.mesh.startMedia = jest.fn(async () => {});
  try {
    await f.calls.start('peer', 'voice');
    expect(f.calls.snapshot()?.ringingConfirmed).toBeFalsy();
    await f.calls.receiveRingingReceipt('other-peer', 'outgoing-id');
    await f.calls.receiveRingingReceipt('peer', 'other-call');
    expect(f.calls.snapshot()?.ringingConfirmed).toBeFalsy();
    await f.calls.receiveRingingReceipt('peer', 'outgoing-id');
    expect(f.calls.snapshot()?.ringingConfirmed).toBe(true);
    expect(f.calls.snapshot()?.connectedAt).toBeUndefined();
    await f.calls.receive('peer', {
      type: 'call',
      id: 'outgoing-id',
      action: 'accept',
      media: 'voice',
    });
    await f.calls.receiveRingingReceipt('peer', 'outgoing-id');
    expect(f.calls.snapshot()?.status).toBe('connecting');
    await f.calls.end();
    await f.calls.receiveRingingReceipt('peer', 'outgoing-id');
    expect(f.calls.snapshot()?.status).toBe('ended');
    await f.calls.receive('peer', {
      type: 'call',
      id: 'new-call',
      action: 'invite',
      media: 'voice',
    });
    await f.calls.receiveRingingReceipt('peer', 'outgoing-id');
    expect(f.calls.snapshot()?.ringingConfirmed).toBeFalsy();
  } finally {
    f.calls.stop();
  }
});

test('failed receipt persistence can retry and a dismissed incoming call never acknowledges', async () => {
  const ringingReceipt = jest.fn(async () => {}).mockRejectedValueOnce(new Error('STORAGE_BUSY'));
  const f = runtime({ send: jest.fn(async () => {}), ringingReceipt });
  try {
    await f.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'voice',
    });
    await expect(f.calls.confirmIncoming('incoming-id')).rejects.toThrow('STORAGE_BUSY');
    await f.calls.confirmIncoming('incoming-id');
    expect(ringingReceipt).toHaveBeenCalledTimes(2);
    await f.calls.end();
    await f.calls.confirmIncoming('incoming-id');
    expect(ringingReceipt).toHaveBeenCalledTimes(2);
  } finally {
    f.calls.stop();
  }
});

test('caller media preparation overlaps invite delivery and a pending invite cannot restart a cancelled call', async () => {
  let delivered!: () => void;
  const send = jest.fn(async (_peer, control) => {
    if (control.action === 'invite')
      await new Promise<void>((resolve) => {
        delivered = resolve;
      });
  });
  const f = runtime({ send });
  f.mesh.prepareOutgoingMedia = jest.fn(async () => {});
  f.mesh.publishPreparedMedia = jest.fn(async () => {});
  try {
    const pending = f.calls.start('peer', 'video');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(send).toHaveBeenCalledWith('peer', expect.objectContaining({ action: 'invite' }));
    expect(f.mesh.prepareOutgoingMedia).toHaveBeenCalledWith(
      'peer',
      'outgoing-id',
      f.calls.snapshot()?.local,
    );
    expect(f.calls.snapshot()?.status).toBe('ringing');
    expect(f.mesh.publishPreparedMedia).not.toHaveBeenCalled();
    await f.calls.end();
    delivered();
    await pending;
    expect(f.calls.snapshot()?.status).toBe('ended');
    expect(f.mesh.prepareOutgoingMedia).toHaveBeenCalledTimes(1);
    expect(f.mesh.publishPreparedMedia).not.toHaveBeenCalled();
    expect(f.mesh.endMedia).toHaveBeenCalledWith('peer', 'outgoing-id');
  } finally {
    f.calls.stop();
  }
});

test('early offer publication follows invite persistence and cannot hold the calling UI open', async () => {
  let persist!: () => void;
  const f = runtime({
    send: async (_peer, control) => {
      if (control.action === 'invite') await new Promise<void>((resolve) => (persist = resolve));
    },
  });
  f.mesh.prepareOutgoingMedia = jest.fn(async () => {});
  f.mesh.publishPreparedMedia = jest.fn(() => new Promise<void>(() => {}));
  try {
    const pending = f.calls.start('peer', 'voice');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(f.mesh.publishPreparedMedia).not.toHaveBeenCalled();
    persist();
    await pending;
    expect(f.mesh.publishPreparedMedia).toHaveBeenCalledWith('peer', 'outgoing-id');
    expect(f.calls.snapshot()?.status).toBe('ringing');
    expect(f.calls.snapshot()?.connectedAt).toBeUndefined();
  } finally {
    f.calls.stop();
  }
});

test('answer signaling overlaps capture while cached media waits for capture consent and readiness', async () => {
  let capture!: (stream: MediaStream) => void;
  let persist!: () => void;
  const send = jest.fn(async (_peer, control) => {
    if (control.action === 'accept') await new Promise<void>((resolve) => (persist = resolve));
  });
  const f = runtime({ send });
  f.mesh.resumeCallMedia = jest.fn(async () => {});
  const stream = { getTracks: () => [] } as unknown as MediaStream;
  jest
    .mocked(captureCall)
    .mockImplementationOnce(() => new Promise<MediaStream>((resolve) => (capture = resolve)));
  try {
    await f.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'video',
    });
    expect(send).not.toHaveBeenCalled();
    const pending = f.calls.accept();
    expect(send).toHaveBeenCalledWith('peer', expect.objectContaining({ action: 'accept' }));
    expect(f.mesh.resumeCallMedia).not.toHaveBeenCalled();
    expect(f.calls.snapshot()?.local).toBeNull();
    capture(stream);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(f.calls.snapshot()?.local).toBe(stream);
    expect(f.mesh.resumeCallMedia).toHaveBeenCalledWith('peer', 'incoming-id');
    expect(f.calls.snapshot()?.connectedAt).toBeUndefined();
    persist();
    await pending;
  } finally {
    f.calls.stop();
  }
});

test('failed acceptance stops late captured tracks and never resumes the cached offer', async () => {
  let capture!: (stream: MediaStream) => void;
  const f = runtime({
    send: async () => {
      throw new Error('STORAGE_FAILED');
    },
  });
  f.mesh.resumeCallMedia = jest.fn(async () => {});
  const stop = jest.fn();
  jest
    .mocked(captureCall)
    .mockImplementationOnce(() => new Promise<MediaStream>((resolve) => (capture = resolve)));
  try {
    await f.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'voice',
    });
    const pending = f.calls.accept();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(f.calls.snapshot()?.status).toBe('failed');
    capture({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await pending;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(f.mesh.resumeCallMedia).not.toHaveBeenCalled();
  } finally {
    f.calls.stop();
  }
});

test('capture failure after accepting sends an end control so the caller cannot keep connecting', async () => {
  const send = jest.fn(async () => {});
  const f = runtime({ send });
  jest.mocked(captureCall).mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
  try {
    await f.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'video',
    });
    await f.calls.accept();
    expect(send.mock.calls).toEqual([
      ['peer', { type: 'call', id: 'incoming-id', action: 'accept', media: 'video' }],
      ['peer', { type: 'call', id: 'incoming-id', action: 'end', media: 'video' }],
    ]);
    expect(f.calls.snapshot()?.status).toBe('failed');
  } finally {
    f.calls.stop();
  }
});

test('a late acceptance failure cannot end a replacement incoming call', async () => {
  let reject!: (error: Error) => void;
  const f = runtime({
    send: async (_peer, control) => {
      if (control.action === 'accept') await new Promise<void>((_resolve, fail) => (reject = fail));
    },
  });
  try {
    await f.calls.receive('peer', {
      type: 'call',
      id: 'incoming-id',
      action: 'invite',
      media: 'voice',
    });
    const pending = f.calls.accept();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await f.calls.end();
    await f.calls.receive('second-peer', {
      type: 'call',
      id: 'next-id',
      action: 'invite',
      media: 'voice',
    });
    reject(new Error('LATE_STORAGE_FAILURE'));
    await pending;
    expect(f.calls.snapshot()?.id).toBe('next-id');
    expect(f.calls.snapshot()?.status).toBe('incoming');
  } finally {
    f.calls.stop();
  }
});

test('pending media setup releases the inbox for hangup and cannot fail a replacement call later', async () => {
  const f = runtime({ send: jest.fn(async () => {}) });
  let fail!: (error: Error) => void;
  f.mesh.startMedia = jest.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  try {
    await f.calls.start('peer', 'video');
    await f.calls.receive('peer', {
      type: 'call',
      id: 'outgoing-id',
      action: 'accept',
      media: 'video',
    });
    expect(f.calls.snapshot()?.status).toBe('connecting');
    expect(f.calls.snapshot()?.connectedAt).toBeUndefined();
    await f.calls.receive('peer', {
      type: 'call',
      id: 'outgoing-id',
      action: 'end',
      media: 'video',
    });
    expect(f.calls.snapshot()?.status).toBe('ended');
    await f.calls.receive('second-peer', {
      type: 'call',
      id: 'new-call',
      action: 'invite',
      media: 'voice',
    });
    fail(new Error('TURN_UNAVAILABLE'));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(f.calls.snapshot()?.id).toBe('new-call');
    expect(f.calls.snapshot()?.status).toBe('incoming');
    expect(f.recordCall).toHaveBeenCalledTimes(1);
  } finally {
    f.calls.stop();
  }
});
