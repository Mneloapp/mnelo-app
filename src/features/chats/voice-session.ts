export type VoicePlaybackLease = { active(): boolean; stop(): void | Promise<void> };
let recording: symbol | undefined;
const players = new Map<symbol, { stop(): Promise<void> }>();

// Claim before awaiting native work. A recorder waits for even a pending player
// to relinquish audio, so a late playback preparation cannot steal the session.
export async function reserveVoicePlayback(
  interrupted: () => void,
  prepare: (interrupt: () => void) => Promise<VoicePlaybackLease>,
): Promise<VoicePlaybackLease> {
  if (recording) throw new Error('AUDIO_RECORDING_ACTIVE');
  const token = Symbol('voice-player');
  const previous = [...players.values()];
  let cancelled = false;
  let complete!: (lease: VoicePlaybackLease | null) => void;
  const ready = new Promise<VoicePlaybackLease | null>((resolve) => {
    complete = resolve;
  });
  let stopping: Promise<void> | undefined;
  const stop = () => {
    if (stopping) return stopping;
    if (!cancelled) {
      try {
        interrupted();
      } catch {
        /* Player may already be disposed. */
      }
    }
    cancelled = true;
    players.delete(token);
    stopping = ready.then(async (route) => {
      await route?.stop();
    });
    return stopping;
  };
  players.set(token, { stop });
  try {
    await Promise.all(previous.map((player) => player.stop()));
    if (recording || cancelled) throw new Error('AUDIO_RECORDING_ACTIVE');
    const route = await prepare(() => {
      cancelled = true;
      players.delete(token);
      interrupted();
    });
    complete(route);
    if (recording || cancelled || !route.active()) {
      await stop();
      throw new Error('AUDIO_ROUTE_UNAVAILABLE');
    }
    return { active: () => !cancelled && route.active(), stop };
  } catch (error) {
    complete(null);
    players.delete(token);
    throw error;
  }
}
export async function beginVoiceRecording(): Promise<() => void> {
  if (recording) throw new Error('AUDIO_RECORDING_ACTIVE');
  const token = Symbol('voice-recorder');
  recording = token;
  try {
    await Promise.all([...players.values()].map((player) => player.stop()));
    return () => {
      if (recording === token) recording = undefined;
    };
  } catch (error) {
    if (recording === token) recording = undefined;
    throw error;
  }
}
