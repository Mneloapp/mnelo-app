import * as Signal from '@signalapp/libsignal-client';
import { SignalFixture } from './signal-fixture';
import type { SignalProvider, SignalState } from '../../src/messenger/delivery/signal';
import type { SignalBundle } from '../../src/messenger/delivery/schema';

// Test-only adapter over the actual official Rust-backed Node implementation.
// Exercises database crash/restart semantics without mocking cryptography.
type State = {
  nextPreKey?: number;
  identity: string;
  registration: number;
  sessions: Record<string, string>;
  identities: Record<string, string>;
  preKeys: Record<string, string>;
  signedKeys: Record<string, string>;
  kyberKeys: Record<string, string>;
};
const b64 = (value: Uint8Array) => Buffer.from(value).toString('base64');
const bytes = (value: string) => Buffer.from(value, 'base64');
function save(f: SignalFixture): SignalState {
  return JSON.stringify({
    identity: b64(f.identity.serialize()),
    registration: f.registration,
    nextPreKey: f.nextPreKey,
    sessions: Object.fromEntries([...f.sessions].map(([key, value]) => [key, b64(value)])),
    identities: Object.fromEntries(
      [...f.identities].map(([key, value]) => [key, b64(value.serialize())]),
    ),
    preKeys: Object.fromEntries([...f.prekeys].map(([id, value]) => [id, b64(value.serialize())])),
    signedKeys: Object.fromEntries(
      [...f.signed].map(([id, value]) => [id, b64(value.serialize())]),
    ),
    kyberKeys: Object.fromEntries([...f.kyber].map(([id, value]) => [id, b64(value.serialize())])),
  } satisfies State) as SignalState;
}
function load(state: SignalState, own = 'a'.repeat(64)) {
  const value = JSON.parse(state) as State;
  const f = new SignalFixture(own, {
    identity: Signal.IdentityKeyPair.deserialize(bytes(value.identity)),
    registration: value.registration,
  });
  for (const [key, data] of Object.entries(value.sessions)) f.sessions.set(key, bytes(data));
  for (const [key, data] of Object.entries(value.identities))
    f.identities.set(key, Signal.PublicKey.deserialize(bytes(data)));
  for (const [key, data] of Object.entries(value.preKeys))
    f.prekeys.set(Number(key), Signal.PreKeyRecord.deserialize(bytes(data)));
  for (const [key, data] of Object.entries(value.signedKeys))
    f.signed.set(Number(key), Signal.SignedPreKeyRecord.deserialize(bytes(data)));
  for (const [key, data] of Object.entries(value.kyberKeys))
    f.kyber.set(Number(key), Signal.KyberPreKeyRecord.deserialize(bytes(data)));
  f.nextPreKey = value.nextPreKey ?? Math.max(1, ...f.prekeys.keys()) + 1;
  return f;
}
export class NodeSignal implements SignalProvider {
  async needsBundle(state: SignalState, peer: string) {
    return !(await load(state).getSession(Signal.ProtocolAddress.new(peer, 1)))?.hasCurrentState();
  }
  async create() {
    const f = new SignalFixture('a'.repeat(64));
    f.bundle();
    return { state: save(f), result: f.publicKeys() };
  }
  async public(state: SignalState) {
    const f = load(state);
    return { state, result: f.publicKeys() };
  }
  async replenish(state: SignalState, count: number) {
    const f = load(state);
    f.replenish(count);
    return { state: save(f), result: f.publicKeys() };
  }
  async encrypt(state: SignalState, input: Parameters<SignalProvider['encrypt']>[1]) {
    const f = load(state, input.own),
      peer = Signal.ProtocolAddress.new(input.peer, 1);
    const expected = Signal.PublicKey.deserialize(bytes(input.expectedIdentity));
    const old = f.identities.get(peer.toString());
    if (old && !old.equals(expected)) throw new Error('SIGNAL_IDENTITY_CHANGED');
    f.identities.set(peer.toString(), expected);
    if (!(await f.getSession(peer))?.hasCurrentState()) {
      if (!input.bundle) throw new Error('SIGNAL_BUNDLE_REQUIRED');
      await Signal.processPreKeyBundle(nativeBundle(input.bundle), peer, f.address, f, f);
    }
    const message = await Signal.signalEncrypt(bytes(input.message), peer, f.address, f, f);
    return {
      state: save(f),
      result: { type: message.type() as 2 | 3, message: b64(message.serialize()) },
    };
  }
  async decrypt(state: SignalState, input: Parameters<SignalProvider['decrypt']>[1]) {
    const f = load(state, input.own),
      peer = Signal.ProtocolAddress.new(input.peer, 1);
    const expected = Signal.PublicKey.deserialize(bytes(input.expectedIdentity));
    const old = f.identities.get(peer.toString());
    if (old && !old.equals(expected)) throw new Error('SIGNAL_IDENTITY_CHANGED');
    f.identities.set(peer.toString(), expected);
    const plain = await f.decrypt(peer, { type: input.type, ciphertext: input.message });
    return { state: save(f), result: { message: b64(Buffer.from(plain)) } };
  }
}
function nativeBundle(b: SignalBundle) {
  return Signal.PreKeyBundle.new(
    b.registration,
    b.device,
    b.oneTime.id,
    Signal.PublicKey.deserialize(bytes(b.oneTime.key)),
    b.signed.id,
    Signal.PublicKey.deserialize(bytes(b.signed.key)),
    bytes(b.signed.signature),
    Signal.PublicKey.deserialize(bytes(b.identity)),
    b.oneTime.kyber.id,
    Signal.KEMPublicKey.deserialize(bytes(b.oneTime.kyber.key)),
    bytes(b.oneTime.kyber.signature),
  );
}
