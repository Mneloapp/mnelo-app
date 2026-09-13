import { z } from 'zod';
import type { DeviceMessenger } from './engine';
import { localProfile } from './local-profile';

const frame = z
  .object({
    index: z.number().int().min(0).max(7),
    total: z.number().int().min(1).max(8),
    data: z.string().max(12_000),
  })
  .strict();
const envelope = z.object({ version: z.literal(1), profile: localProfile }).strict();

/** An optional channel. Older Mnelo clients close this channel, retaining chats/calls. */
export function bindProfileChannel(engine: DeviceMessenger, peer: string, channel: RTCDataChannel) {
  let stopped = false,
    sending = false,
    lastSent = '',
    incoming = '',
    next = 0,
    total = 0;
  let incomingAt = 0,
    windowAt = Date.now(),
    received = 0,
    queued = 0;
  let tail = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    incoming = '';
    channel.close();
  };
  const send = async () => {
    if (stopped || sending || channel.readyState !== 'open') return;
    sending = true;
    try {
      if (!(await engine.acceptsPeer(peer))) return stop();
      const text = JSON.stringify({ version: 1, profile: engine.currentProfile() });
      if (text === lastSent) return;
      if (channel.bufferedAmount > 128_000) {
        timer = setTimeout(() => void send(), 500);
        return;
      }
      const count = Math.ceil(text.length / 12_000);
      for (let index = 0; index < count; index++) {
        if (stopped || channel.readyState !== 'open') return;
        channel.send(
          JSON.stringify({
            index,
            total: count,
            data: text.slice(index * 12_000, (index + 1) * 12_000),
          }),
        );
      }
      lastSent = text;
    } catch {
      stop();
    } finally {
      sending = false;
    }
  };
  const unsubscribe = engine.subscribe(() => void send());
  channel.addEventListener('open', () => void send());
  channel.addEventListener('close', stop);
  channel.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || event.data.length > 24_000 || ++queued > 16)
      return stop();
    const text = event.data;
    tail = tail
      .then(async () => {
        if (stopped) return;
        if (!(await engine.acceptsPeer(peer))) return stop();
        const value = frame.parse(JSON.parse(text));
        const now = Date.now();
        if (now - windowAt >= 60_000) {
          windowAt = now;
          received = 0;
        }
        if (value.index === 0) {
          if (next !== 0 || ++received > 12) return stop();
          incomingAt = now;
          total = value.total;
        }
        if (value.index !== next || value.total !== total || now - incomingAt > 10_000)
          return stop();
        incoming += value.data;
        if (incoming.length > 60_000) return stop();
        if (++next < total) return;
        const data = envelope.parse(JSON.parse(incoming));
        incoming = '';
        next = 0;
        total = 0;
        await engine.receiveProfile(peer, data.profile);
      })
      .catch(stop)
      .finally(() => {
        queued--;
      });
  });
  // A remotely created channel can already be open when it reaches this handler.
  void send();
  return stop;
}
