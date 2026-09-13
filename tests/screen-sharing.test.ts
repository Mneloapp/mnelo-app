import { DeviceCalls } from '@/messenger/calls';
import { captureCall } from '@/messenger/call-platform';
import { captureScreen } from '@/messenger/capture-screen';
import type { ScreenCapture } from '@/messenger/screen-capture';
import type { DeviceMessenger } from '@/messenger/engine';
import type { PeerMesh } from '@/messenger/peer-mesh';
jest.mock('@/messenger/capture-screen', () => ({ captureScreen: jest.fn() }));
jest.mock('@/messenger/crypto', () => ({ directChatId: () => 'chat' }));
jest.mock('@/messenger/call-platform', () => ({
  captureCall: jest.fn(),
  stopCallAudio: jest.fn(async () => {}),
  speakerOutput: jest.fn(),
  switchCallCamera: jest.fn(),
  callOutputStream: (local: MediaStream, screen: MediaStream) => ({
    getTracks: () => [...local.getAudioTracks(), ...screen.getVideoTracks()],
  }),
}));

function media() {
  const listeners = new Map<string, () => void>();
  const video = {
    kind: 'video',
    enabled: true,
    stop: jest.fn(),
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
  };
  const audio = { kind: 'audio', enabled: true, stop: jest.fn() };
  const stream = {
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
  return { stream, video, audio, ended: () => listeners.get('ended')?.() };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup(kind: 'voice' | 'video' = 'video') {
  const local = media(),
    display = media();
  const stop = jest.fn();
  const mesh = {
    startMedia: jest.fn(async () => {}),
    endMedia: jest.fn(),
    replaceVideo: jest.fn(async (_id: string, _track: MediaStreamTrack | null) => {}),
    publishMediaState: jest.fn(),
  };
  const calls = new DeviceCalls(
    {
      acceptsPeer: async () => true,
      currentIdentity: () => ({ key: 'own' }),
      recordCall: jest.fn(async () => {}),
    } as unknown as DeviceMessenger,
    mesh as unknown as PeerMesh,
    () => 'call',
    {
      send: async () => {},
    },
  );
  jest.mocked(captureCall).mockResolvedValue(local.stream);
  jest.mocked(captureScreen).mockResolvedValue({ stream: display.stream, stop });
  await calls.start('peer', kind);
  await calls.receive('peer', { type: 'call', id: 'call', media: kind, action: 'accept' });
  calls.connected('peer', 'call');
  return { calls, local, display, stop, mesh };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

test('screen sharing starts only on an explicit video-call action and restores camera and mute choices', async () => {
  const { calls, local, display, stop, mesh } = await setup();
  try {
    expect(captureScreen).not.toHaveBeenCalled();
    calls.mute();
    calls.camera();
    await calls.shareScreen();
    expect(calls.snapshot()?.screen).toBe(display.stream);
    expect(mesh.replaceVideo).toHaveBeenLastCalledWith('call', display.video);
    expect(calls.outputStream()?.getTracks()).toEqual([local.audio, display.video]);
    expect(local.audio.enabled).toBe(false);
    expect(local.video.enabled).toBe(false);
    expect(calls.localMediaState()).toEqual({ v: 1, sharing: true, camera: false, muted: true });
    calls.camera();
    expect(calls.snapshot()?.camera).toBe(false);
    await calls.stopScreenShare();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mesh.replaceVideo).toHaveBeenLastCalledWith('call', local.video);
    expect(calls.snapshot()?.screen).toBeNull();
    expect(local.video.enabled).toBe(false);
    expect(local.audio.enabled).toBe(false);
  } finally {
    calls.stop();
  }
});
test('voice calls cannot capture a screen', async () => {
  const { calls } = await setup('voice');
  try {
    await calls.shareScreen();
    expect(captureScreen).not.toHaveBeenCalled();
  } finally {
    calls.stop();
  }
});
test.each(['cancel', 'end'] as const)(
  '%s during system consent stops a late display stream and cannot restart sharing',
  async (action) => {
    const { calls, display, stop, mesh } = await setup();
    const pending = deferred<ScreenCapture>();
    jest.mocked(captureScreen).mockReturnValue(pending.promise);
    try {
      const sharing = calls.shareScreen();
      const signal = jest.mocked(captureScreen).mock.calls[0]![1];
      expect(calls.snapshot()?.screenStarting).toBe(true);
      if (action === 'end') await calls.end();
      else await calls.stopScreenShare();
      expect(signal.aborted).toBe(true);
      pending.resolve({ stream: display.stream, stop });
      await sharing;
      expect(stop).toHaveBeenCalledTimes(1);
      expect(calls.snapshot()?.screen).toBeNull();
      expect(mesh.replaceVideo).not.toHaveBeenCalledWith('call', display.video);
      expect(calls.snapshot()?.status).toBe(action === 'end' ? 'ended' : 'active');
    } finally {
      calls.stop();
    }
  },
);
test('the operating-system Stop control returns to the existing camera', async () => {
  const { calls, display, local, stop, mesh } = await setup();
  try {
    await calls.shareScreen();
    display.ended();
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(calls.snapshot()?.screen).toBeNull();
    expect(local.video.enabled).toBe(true);
    expect(mesh.replaceVideo).toHaveBeenLastCalledWith('call', local.video);
  } finally {
    calls.stop();
  }
});
test('partial replacement failure restores all cameras; failed restoration ends the call', async () => {
  const { calls, stop, local, mesh } = await setup();
  try {
    mesh.replaceVideo.mockRejectedValueOnce(new Error('REPLACE_FAILED'));
    await expect(calls.shareScreen()).rejects.toThrow('REPLACE_FAILED');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(calls.snapshot()?.screen).toBeNull();
    expect(calls.snapshot()?.status).toBe('active');
    expect(mesh.replaceVideo).toHaveBeenLastCalledWith('call', local.video);
    mesh.replaceVideo.mockRejectedValue(new Error('RESTORE_FAILED'));
    await expect(calls.shareScreen()).rejects.toThrow('RESTORE_FAILED');
    expect(calls.snapshot()?.status).toBe('failed');
    expect(local.audio.stop).toHaveBeenCalled();
  } finally {
    calls.stop();
  }
});
test('ending while video replacement is pending stops capture immediately and ignores its completion', async () => {
  const { calls, display, stop, mesh } = await setup();
  const replacement = deferred<void>();
  mesh.replaceVideo.mockReturnValueOnce(replacement.promise);
  try {
    const sharing = calls.shareScreen();
    await Promise.resolve();
    expect(calls.snapshot()?.screen).toBe(display.stream);
    await calls.end();
    expect(stop).toHaveBeenCalled();
    replacement.resolve();
    await sharing;
    expect(calls.snapshot()?.status).toBe('ended');
    expect(calls.snapshot()?.screen).toBeNull();
    expect(calls.snapshot()?.screenStarting).toBe(false);
  } finally {
    calls.stop();
  }
});
