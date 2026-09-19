import { beginVoiceRecording, reserveVoicePlayback } from '@/features/chats/voice-session';
function route() {
  return { active: () => true, stop: jest.fn(async () => {}) };
}
test('recording awaits pending playback native cleanup and rejects new players until its scoped release', async () => {
  let prepared!: (value: ReturnType<typeof route>) => void;
  const native = route();
  const pause = jest.fn();
  const starting = reserveVoicePlayback(
    pause,
    () =>
      new Promise((resolve) => {
        prepared = resolve;
      }),
  );
  const result = expect(starting).rejects.toThrow('AUDIO_ROUTE_UNAVAILABLE');
  await Promise.resolve();
  let recordingReady = false;
  const recording = beginVoiceRecording().then((release) => {
    recordingReady = true;
    return release;
  });
  expect(pause).toHaveBeenCalledTimes(1);
  await expect(reserveVoicePlayback(jest.fn(), async () => route())).rejects.toThrow(
    'AUDIO_RECORDING_ACTIVE',
  );
  expect(recordingReady).toBe(false);
  prepared(native);
  const release = await recording;
  await result;
  expect(native.stop).toHaveBeenCalledTimes(1);
  release();
  const next = await reserveVoicePlayback(jest.fn(), async () => route());
  await next.stop();
});
test('new player stops the previous player and its late release cannot stop the replacement', async () => {
  const oldRoute = route(),
    nextRoute = route(),
    pause = jest.fn();
  const first = await reserveVoicePlayback(pause, async () => oldRoute);
  const next = await reserveVoicePlayback(jest.fn(), async () => nextRoute);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(oldRoute.stop).toHaveBeenCalledTimes(1);
  await first.stop();
  expect(nextRoute.stop).not.toHaveBeenCalled();
  await next.stop();
});
test('a failed native preparation leaves no lease blocking a recording', async () => {
  await expect(
    reserveVoicePlayback(jest.fn(), async () => {
      throw new Error('No audio');
    }),
  ).rejects.toThrow('No audio');
  const release = await beginVoiceRecording();
  release();
});
test('duplicate old recording release cannot clear a newer recording owner', async () => {
  const first = await beginVoiceRecording();
  first();
  const second = await beginVoiceRecording();
  first();
  await expect(reserveVoicePlayback(jest.fn(), async () => route())).rejects.toThrow(
    'AUDIO_RECORDING_ACTIVE',
  );
  second();
});
