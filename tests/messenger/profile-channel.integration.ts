import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindProfileChannel } from '../../src/messenger/profile-channel';
import { emptyProfile } from '../../src/messenger/local-profile';
import type { DeviceMessenger } from '../../src/messenger/engine';

class Channel extends EventTarget {
  readyState = 'open';
  bufferedAmount = 0;
  sent: string[] = [];
  send(value: string) {
    this.sent.push(value);
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
  receive(value: string) {
    this.dispatchEvent(new MessageEvent('message', { data: value }));
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(allowed = true) {
  const channel = new Channel();
  const profile = emptyProfile();
  const saved: unknown[] = [];
  let listener = () => {};
  const engine = {
    acceptsPeer: async () => allowed,
    currentProfile: () => profile,
    receiveProfile: async (peer: string, value: unknown) => {
      saved.push({ peer, value });
      return true;
    },
    subscribe: (value: () => void) => {
      listener = value;
      return () => {
        listener = () => {};
      };
    },
  } as unknown as DeviceMessenger;
  const stop = bindProfileChannel(engine, 'trusted-peer', channel as unknown as RTCDataChannel);
  return { channel, profile, saved, stop, update: () => listener() };
}
function frames(value: unknown) {
  const text = JSON.stringify(value),
    size = 80,
    total = Math.ceil(text.length / size);
  return Array.from({ length: total }, (_, index) =>
    JSON.stringify({ index, total, data: text.slice(index * size, (index + 1) * size) }),
  );
}
test('already-open authenticated channel sends once, shares updates and reassembles one peer-scoped card', async () => {
  const fixture = setup();
  try {
    await tick();
    assert.equal(fixture.channel.sent.length, 1);
    fixture.update();
    await tick();
    assert.equal(fixture.channel.sent.length, 1);
    fixture.profile.about = 'Changed';
    fixture.update();
    await tick();
    assert.equal(fixture.channel.sent.length, 2);
    const card = { ...emptyProfile(), firstName: 'Remote' };
    for (const part of frames({ version: 1, profile: card })) fixture.channel.receive(part);
    await tick();
    assert.deepEqual(fixture.saved, [{ peer: 'trusted-peer', value: card }]);
    fixture.stop();
    fixture.profile.about = 'After stop';
    fixture.update();
    await tick();
    assert.equal(fixture.channel.sent.length, 2);
  } finally {
    fixture.stop();
  }
});
test('untrusted peers cannot send or receive card content', async () => {
  const f = setup(false);
  await tick();
  assert.equal(f.channel.readyState, 'closed');
  assert.equal(f.channel.sent.length, 0);
  assert.equal(f.saved.length, 0);
});
test('malformed order, spoofed fields, oversized messages and flooding close only the optional channel', async () => {
  const attacks = [
    [JSON.stringify({ index: 1, total: 2, data: '{}' })],
    ['x'.repeat(24001)],
    frames({ version: 1, profile: { ...emptyProfile(), key: 'another-peer' } }),
    Array.from({ length: 17 }, () => JSON.stringify({ index: 0, total: 1, data: '{}' })),
  ];
  for (const attack of attacks) {
    const f = setup();
    await tick();
    for (const part of attack) f.channel.receive(part);
    await tick();
    assert.equal(f.channel.readyState, 'closed');
    assert.equal(f.saved.length, 0);
    f.stop();
  }
});
