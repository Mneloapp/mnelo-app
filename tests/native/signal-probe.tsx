import { useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import { File, Paths } from 'expo-file-system';
import { nativeSignal } from '../../src/messenger/delivery/native.native';
import type { SignalState } from '../../src/messenger/delivery/signal';

type Fixture = {
  own: string;
  peer: string;
  state: string;
  peerIdentity: string;
  type: 2 | 3;
  message: string;
};
// This entry is invoked only by the generated, simulator-only probe. It is never
// imported by index.js/app routes and never opens a user vault or network client.
export function registerSignalProbe(fixture: Fixture) {
  let running: Promise<string> | null = null;
  const probe = async () => {
    const checks: string[] = [];
    let stage = 'CREATE';
    const ensure = (condition: boolean, label: string) => {
      if (!condition) throw new Error(label);
      checks.push(label);
    };
    const reject = async (operation: () => Promise<unknown>, label: string) => {
      let rejected = false;
      try {
        await operation();
      } catch {
        rejected = true;
      }
      ensure(rejected, label);
    };
    try {
      const signal = nativeSignal();
      let a = await signal.create(3),
        b = await signal.create(3);
      const own = 'a'.repeat(64),
        peer = 'b'.repeat(64);
      ensure(
        a.result.identity !== b.result.identity && a.result.oneTime.length === 3,
        'NATIVE_KEY_GENERATION',
      );
      stage = 'FIRST_MESSAGE';
      const { oneTime, ...publicB } = b.result;
      const first = await signal.encrypt(a.state, {
        own,
        peer,
        expectedIdentity: b.result.identity,
        message: btoa('NATIVE_FIRST'),
        bundle: { ...publicB, oneTime: oneTime[0]! },
      });
      const args = {
        own: peer,
        peer: own,
        expectedIdentity: a.result.identity,
        type: first.result.type,
        message: first.result.message,
      };
      stage = 'NEGATIVE_INPUTS';
      await reject(
        () => signal.decrypt(b.state, { ...args, expectedIdentity: b.result.identity }),
        'WRONG_IDENTITY_REJECTED',
      );
      const bytes = atob(first.result.message),
        index = Math.floor(bytes.length / 2);
      const altered =
        bytes.slice(0, index) +
        String.fromCharCode(bytes.charCodeAt(index) ^ 1) +
        bytes.slice(index + 1);
      await reject(
        () => signal.decrypt(b.state, { ...args, message: btoa(altered) }),
        'TAMPERED_CIPHERTEXT_REJECTED',
      );
      stage = 'DECRYPT';
      const received = await signal.decrypt(b.state, args);
      ensure(atob(received.result.message) === 'NATIVE_FIRST', 'NATIVE_MESSAGE_DECRYPTED');
      await reject(() => signal.decrypt(received.state, args), 'REPLAY_REJECTED');
      b = await signal.public(received.state);
      ensure(b.result.oneTime.length === 2, 'ONE_TIME_KEYS_CONSUMED');
      stage = 'REPLY';
      const reply = await signal.encrypt(received.state, {
        own: peer,
        peer: own,
        expectedIdentity: a.result.identity,
        message: btoa('NATIVE_REPLY'),
      });
      const back = await signal.decrypt(first.state, {
        own,
        peer,
        expectedIdentity: b.result.identity,
        ...reply.result,
      });
      ensure(atob(back.result.message) === 'NATIVE_REPLY', 'NATIVE_REPLY_DECRYPTED');
      a = await signal.public(back.state);
      stage = 'OUT_OF_ORDER';
      const second = await signal.encrypt(a.state, {
        own,
        peer,
        expectedIdentity: b.result.identity,
        message: btoa('SECOND'),
      });
      const third = await signal.encrypt(second.state, {
        own,
        peer,
        expectedIdentity: b.result.identity,
        message: btoa('THIRD'),
      });
      const thirdReceived = await signal.decrypt(reply.state, {
        own: peer,
        peer: own,
        expectedIdentity: a.result.identity,
        ...third.result,
      });
      const secondReceived = await signal.decrypt(thirdReceived.state, {
        own: peer,
        peer: own,
        expectedIdentity: a.result.identity,
        ...second.result,
      });
      ensure(
        atob(thirdReceived.result.message) === 'THIRD' &&
          atob(secondReceived.result.message) === 'SECOND',
        'OUT_OF_ORDER_DECRYPTED',
      );
      stage = 'REPLENISH';
      const replenished = await signal.replenish(a.state, 2);
      ensure(
        replenished.result.identity === a.result.identity &&
          replenished.result.oneTime.length === a.result.oneTime.length + 2,
        'KEY_REPLENISHMENT_PRESERVES_IDENTITY',
      );
      stage = 'NODE_TO_NATIVE';
      const cross = await signal.decrypt(fixture.state as SignalState, {
        own: fixture.own,
        peer: fixture.peer,
        expectedIdentity: fixture.peerIdentity,
        type: fixture.type,
        message: fixture.message,
      });
      ensure(atob(cross.result.message) === 'MNELO_NATIVE_INTEROP_IN', 'NODE_TO_NATIVE_DECRYPTED');
      stage = 'NATIVE_TO_NODE';
      const crossReply = await signal.encrypt(cross.state, {
        own: fixture.own,
        peer: fixture.peer,
        expectedIdentity: fixture.peerIdentity,
        message: btoa('MNELO_NATIVE_INTEROP_OUT'),
      });
      const report = JSON.stringify({
        status: 'PASS',
        platform: Platform.OS,
        checks,
        reply: crossReply.result,
      });
      new File(Paths.document, 'native-signal-probe.json').write(report);
      // Only test outcomes and a synthetic ciphertext. This probe never logs
      // its fixture, plaintext, private keys or vendor session state.
      console.info('MNELO_NATIVE_PROBE_RESULT:' + report);
      return (
        'PASS — ' + checks.length + ' native checks. Reply ready for independent verification.'
      );
    } catch {
      new File(Paths.document, 'native-signal-probe.json').write(
        JSON.stringify({ status: 'FAIL', stage, checks }),
      );
      return 'FAIL — ' + stage;
    }
  };
  function Probe() {
    const [result, setResult] = useState('Native Signal QA running…');
    useEffect(() => {
      let mounted = true;
      void (running ??= probe()).then((value) => {
        if (mounted) setResult(value);
      });
      return () => {
        mounted = false;
      };
    }, []);
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 30 }}>
        <Text accessibilityRole="header">Mnelo — isolated native protocol test</Text>
        <Text selectable>{result}</Text>
        <Text>Synthetic keys only. No account, messages, SMS, relay or push service used.</Text>
      </View>
    );
  }
  registerRootComponent(Probe);
}
