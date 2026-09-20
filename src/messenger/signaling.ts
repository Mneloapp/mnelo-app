import { z } from 'zod';
import { internationalPhone } from './phone-protocol';
import { peerKey } from './model';
import { sign, verify } from './crypto';

export const signalBody = z
  .object({
    protocol: z.literal('mnelo-dtls-v1'),
    from: peerKey,
    to: peerKey,
    session: z.string().uuid(),
    expires: z.number().int(),
    type: z.enum(['offer', 'answer']),
    purpose: z.enum(['message', 'call']).default('message'),
    preparation: z.enum(['transport', 'media']).optional(),
    sdp: z.string().min(1).max(60_000),
    introduction: internationalPhone.optional(),
  })
  .strict();
export const signedSignal = z
  .object({ payload: z.string().max(70_000), signature: z.string().regex(/^[a-f0-9]{128}$/) })
  .strict();
export type Signal = z.input<typeof signalBody>;
export function signSignal(secret: string, signal: Signal) {
  const payload = JSON.stringify(signalBody.parse(signal));
  return { payload, signature: sign(secret, payload) };
}
export function readSignal(input: unknown, recipient: string, now = Date.now()): Signal | null {
  const envelope = signedSignal.safeParse(input);
  if (!envelope.success) return null;
  try {
    const signal = signalBody.parse(JSON.parse(envelope.data.payload));
    if (
      signal.to !== recipient ||
      signal.from === recipient ||
      signal.expires <= now ||
      signal.expires > now + 120_000
    )
      return null;
    const fingerprints = signal.sdp
      .split(/\r?\n/)
      .filter((line) => line.startsWith('a=fingerprint:'));
    if (
      !fingerprints.length ||
      fingerprints.some(
        (line) => !/^a=fingerprint:sha-256 (?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(line),
      )
    )
      return null;
    return verify(signal.from, envelope.data.signature, envelope.data.payload) ? signal : null;
  } catch {
    return null;
  }
}
export function authenticationPayload(key: string, nonce: string) {
  return JSON.stringify([
    'mnelo-relay-auth-v1',
    peerKey.parse(key),
    z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(nonce),
  ]);
}

export function relayAddress(raw: string | undefined, local: boolean): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.hash || url.search || url.pathname !== '/')
      throw new Error();
    if (url.protocol !== 'wss:' && !(local && loopback && url.protocol === 'ws:'))
      throw new Error();
    if (!local && loopback) throw new Error();
    return url.href;
  } catch {
    throw new Error('RELAY_CONFIGURATION_INVALID');
  }
}
