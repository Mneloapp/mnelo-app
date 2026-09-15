import { Platform, AppState } from 'react-native';
import { requireOptionalNativeModule, type NativeModule } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import type { DeviceCalls, DeviceCall } from './calls';
import { isRemoteRinging } from './call-ringing';
import type { PhoneClient } from './phone-client';
import { pushRegistration } from './wake-protocol';
import { z } from 'zod';
import { setBackgroundStatus, registerBackgroundRetry } from './background-status';
type NativeCalls = NativeModule<{ changed: () => void }> & {
  addListener(name: 'changed', listener: () => void): { remove(): void };
  state(): Promise<{ voipToken?: string; environment: string }>;
  drain(): Promise<unknown[]>;
  incoming(id: string, video: boolean): Promise<void>;
  outgoing(id: string, video: boolean): Promise<void>;
  identify?(id: string, name: string, phone: string, video: boolean): Promise<void>;
  answer(id: string): Promise<void>;
  connected(id: string): Promise<void>;
  ringback?(id: string, enabled: boolean): Promise<void>;
  end(id: string): Promise<void>;
  speaker(enabled: boolean): Promise<void>;
  prepareCallAudio?(speaker: boolean): Promise<void>;
};
const native = requireOptionalNativeModule<NativeCalls>('MneloCalls');
export function systemCallAudio() {
  return Boolean(native);
}
const event = z
  .object({
    type: z.enum(['incoming', 'answer', 'end', 'mute', 'route', 'token', 'token-invalid']),
    id: z.string().uuid().optional(),
    muted: z.boolean().optional(),
    speaker: z.boolean().optional(),
    video: z.boolean().optional(),
    code: z
      .enum([
        'NATIVE_TRANSACTION_FAILED',
        'NATIVE_INCOMING_FAILED',
        'NATIVE_AUDIO_FAILED',
        'NATIVE_ACTION_TIMEOUT',
      ])
      .optional(),
    reason: z.enum(['local', 'remote', 'decline', 'timeout']).optional(),
  })
  .strict();
export function observeSystemCalls(
  calls: DeviceCalls,
  phone: PhoneClient,
  caller?: (call: DeviceCall) => Promise<{ name: string; phone: string } | null>,
) {
  if (!native) {
    setBackgroundStatus('unavailable');
    return () => undefined;
  }
  const bridge = native;
  let stopped = false,
    draining = false,
    drainAgain = false,
    synchronizing = false,
    synchronizeAgain = false;
  const answers = new Set<string>();
  const nativeAnswered = new Set<string>();
  const nativePending = new Set<string>();
  const ended = new Map<
    string,
    { expires: number; reason: 'local' | 'remote' | 'decline' | 'timeout' }
  >();
  let shown: string | null = null;
  let connected: string | null = null;
  let ringing: string | null = null;
  const identifying = new Set<string>();
  const registered = new Map<string, string>();
  let registering: Promise<void> | null = null;
  let registerAgain = false;
  async function registerOnce() {
    try {
      const status = await bridge.state();
      const permission = await Notifications.getPermissionsAsync();
      const allowed =
        permission.granted ||
        permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      const entries: { channel: 'alert' | 'voip'; token: string }[] = [];
      if (status.voipToken) entries.push({ channel: 'voip', token: status.voipToken });
      if (allowed) {
        const token = await Notifications.getDevicePushTokenAsync();
        if ((token.type === 'ios' || token.type === 'android') && typeof token.data === 'string')
          entries.push({ channel: 'alert', token: token.data });
      }
      for (const entry of entries) {
        if (stopped) return;
        const registration = pushRegistration.parse({
          ...entry,
          platform: Platform.OS,
          environment: status.environment,
        });
        const value = JSON.stringify(registration);
        if (registered.get(entry.channel) === value) continue;
        await phone.execute({ action: 'push-register', registration });
        if (stopped) return;
        registered.set(entry.channel, value);
      }
      setBackgroundStatus(
        !allowed
          ? 'permission-required'
          : registered.has('alert') && registered.has('voip')
            ? 'ready'
            : 'checking',
      );
    } catch (error) {
      setBackgroundStatus('unavailable');
      throw error;
    }
  }
  function register(): Promise<void> {
    if (stopped) return Promise.resolve();
    // Accepting the first permission dialog can overlap initial VoIP registration.
    // Re-read permission afterward rather than dropping the alert-token update.
    registerAgain = true;
    if (registering) return registering;
    registering = (async () => {
      do {
        registerAgain = false;
        await registerOnce();
      } while (registerAgain && !stopped);
    })().finally(() => {
      registering = null;
    });
    return registering;
  }
  async function synchronizeOnce() {
    if (stopped) return;
    const call = calls.snapshot();
    for (const [id, value] of ended) if (value.expires < Date.now()) ended.delete(id);
    if (!call || call.status === 'ended' || call.status === 'failed') {
      if (shown) {
        const previous = shown;
        shown = null;
        connected = null;
        ringing = null;
        answers.delete(previous);
        nativeAnswered.delete(previous);
        await bridge.end(previous);
      }
      return;
    }
    if (ended.has(call.id)) {
      await calls.end(false, true, ended.get(call.id)!.reason);
      return;
    }
    if (shown !== call.id) {
      shown = call.id;
      await (call.incoming
        ? bridge.incoming(call.id, call.media === 'video')
        : bridge.outgoing(call.id, call.media === 'video'));
    }
    if (caller && bridge.identify && !identifying.has(call.id)) {
      identifying.add(call.id);
      // Report PushKit immediately; resolve only the authenticated invite's peer.
      void caller(call)
        .then(async (info) => {
          const latest = calls.snapshot();
          if (
            stopped ||
            !info ||
            latest?.id !== call.id ||
            ['ended', 'failed'].includes(latest.status)
          )
            return;
          await bridge.identify?.(call.id, info.name, info.phone, call.media === 'video');
        })
        .catch(() => identifying.delete(call.id));
    }
    if (call.status === 'incoming' && nativePending.has(call.id) && !answers.has(call.id)) {
      // A successful native report and an authenticated invite must both exist.
      // Do not wait for the receipt's storage/network work before processing an answer.
      void calls.confirmIncoming(call.id).catch(() => undefined);
    }
    const shouldRing = isRemoteRinging(call) && Boolean(call.local);
    if (ringing && (!shouldRing || ringing !== call.id)) {
      await bridge.ringback?.(ringing, false);
      ringing = null;
    }
    if (shouldRing && ringing !== call.id) {
      await bridge.ringback?.(call.id, true);
      ringing = call.id;
    }
    if (answers.has(call.id) && call.status === 'incoming') {
      // Camera capture requires a foreground application. A locked-screen answer
      // stays queued until the user opens/unlocks the app; voice can start there.
      if (call.media === 'video' && AppState.currentState !== 'active') return;
      answers.delete(call.id);
      await calls.accept();
    }
    if (
      call.incoming &&
      ['connecting', 'active'].includes(call.status) &&
      !nativeAnswered.has(call.id)
    ) {
      nativeAnswered.add(call.id);
      await bridge.answer(call.id);
    }
    if (call.status === 'active' && connected !== call.id) {
      connected = call.id;
      await bridge.connected(call.id);
    }
  }
  async function synchronize() {
    if (stopped) return;
    synchronizeAgain = true;
    if (synchronizing) return;
    synchronizing = true;
    try {
      do {
        synchronizeAgain = false;
        await synchronizeOnce();
      } while (synchronizeAgain && !stopped);
    } finally {
      synchronizing = false;
    }
  }
  async function drain() {
    if (stopped) return;
    drainAgain = true;
    if (draining) return;
    draining = true;
    try {
      do {
        drainAgain = false;
        for (const raw of await bridge.drain()) {
          const parsed = event.safeParse(raw);
          if (!parsed.success) continue;
          const value = parsed.data;
          if (value.type === 'token') {
            void register().catch(() => undefined);
            continue;
          }
          if (value.type === 'token-invalid') {
            registered.clear();
            continue;
          }
          if (!value.id) continue;
          if (value.type === 'route' && typeof value.speaker === 'boolean')
            calls.audioRoute(value.id, value.speaker);
          if (value.type === 'incoming') nativePending.add(value.id);
          // A PushKit report may precede the authenticated peer invite; do not end it while JS has no call yet.
          if (value.type === 'answer') {
            answers.add(value.id);
            nativeAnswered.add(value.id);
          }
          if (value.type === 'end') {
            answers.delete(value.id);
            nativeAnswered.delete(value.id);
            nativePending.delete(value.id);
            if (!ended.has(value.id))
              ended.set(value.id, {
                expires: Date.now() + 120000,
                reason: value.reason ?? 'local',
              });
            if (calls.snapshot()?.id === value.id) {
              if (value.code) calls.stage(value.code);
              await calls.end(Boolean(value.code), true, ended.get(value.id)!.reason);
            }
          }
          if (
            value.type === 'mute' &&
            calls.snapshot()?.id === value.id &&
            typeof value.muted === 'boolean' &&
            calls.snapshot()?.muted !== value.muted
          )
            calls.mute();
        }
        await synchronize();
      } while (drainAgain && !stopped);
    } finally {
      draining = false;
    }
  }
  const controls = calls.observeControl((value) => {
    if (value.action === 'end' || value.action === 'decline') {
      answers.delete(value.id);
      if (!ended.has(value.id))
        ended.set(value.id, { expires: Date.now() + 120000, reason: 'remote' });
      void bridge.end(value.id).catch(() => undefined);
    }
  });
  registerBackgroundRetry(register);
  const changes = bridge.addListener('changed', () => {
    void drain().catch(() => undefined);
  });
  const unsubscribe = calls.subscribe(() => {
    void synchronize().catch(() => undefined);
  });
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void register().catch(() => undefined);
      void drain().catch(() => undefined);
    }
  });
  const tokens = Notifications.addPushTokenListener(() => {
    registered.delete('alert');
    void register().catch(() => undefined);
  });
  void register().catch(() => undefined);
  void drain().catch(() => undefined);
  return () => {
    stopped = true;
    if (shown) nativePending.add(shown);
    for (const id of nativePending) void bridge.end(id).catch(() => undefined);
    nativePending.clear();
    changes.remove();
    unsubscribe();
    controls();
    registerBackgroundRetry(null);
    app.remove();
    tokens.remove();
  };
}

export async function systemCallSpeaker(enabled: boolean) {
  if (!native) return false;
  await native.speaker(enabled);
  return true;
}
export async function prepareSystemCallAudio(speaker: boolean) {
  if (Platform.OS !== 'ios' || !native?.prepareCallAudio) return false;
  await native.prepareCallAudio(speaker);
  return true;
}
