import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PeerMesh } from '../../src/messenger/peer-mesh';
import type { DeviceMessenger } from '../../src/messenger/engine';
import { createKeys, verify } from '../../src/messenger/crypto';
import { authenticationPayload } from '../../src/messenger/signaling';

test('React Native WebSocket without bufferedAmount still authenticates; proof verifies', async () => {
  const original = globalThis.WebSocket;
  const sent: string[] = [];
  let socket: NativeSocket | undefined;
  class NativeSocket {
    static OPEN = 1;
    readyState = 1;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      socket = this;
    }
    send(text: string) {
      sent.push(text);
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  globalThis.WebSocket = NativeSocket as unknown as typeof WebSocket;
  const identity = { ...createKeys(randomBytes), name: 'Development fixture' };
  const engine = {
    async contacts() {
      return [];
    },
    async acceptsPeer() {
      return false;
    },
  } as unknown as DeviceMessenger;
  const mesh = new PeerMesh(
    identity,
    engine,
    'ws://127.0.0.1:8084',
    () => {
      throw new Error('No peer negotiation expected');
    },
    randomUUID,
    () => {},
  );
  try {
    mesh.start();
    const nonce = randomBytes(32).toString('hex');
    socket?.onmessage?.({ data: JSON.stringify({ type: 'challenge', nonce }) });
    await Promise.resolve();
    assert.equal(sent.length, 1);
    const auth = JSON.parse(sent[0]!);
    assert.equal(auth.type, 'auth');
    assert.equal(auth.key, identity.key);
    assert.ok(verify(identity.key, auth.signature, authenticationPayload(identity.key, nonce)));
  } finally {
    mesh.stop();
    globalThis.WebSocket = original;
  }
});
