import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { NodeSignal } from '../tests/messenger/node-signal';
import { createKeys } from '../src/messenger/crypto';
import type { SignalState } from '../src/messenger/delivery/signal';
async function main() {
  if (process.env.MNELO_NATIVE_PROBE !== '1') throw new Error('NATIVE_PROBE_OPT_IN_REQUIRED');
  const directory = resolve('artifacts/native-signal-probe');
  const signal = new NodeSignal();
  if (process.argv[2] === 'prepare') {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const a = await signal.create(),
      b = await signal.create();
    const own = createKeys(randomBytes).key,
      peer = createKeys(randomBytes).key;
    const { oneTime, ...identity } = b.result;
    const input = Buffer.from('MNELO_NATIVE_INTEROP_IN').toString('base64');
    const wire = await signal.encrypt(a.state, {
      own: peer,
      peer: own,
      expectedIdentity: b.result.identity,
      message: input,
      bundle: { ...identity, oneTime: oneTime[0]! },
    });
    const fixture = {
      own,
      peer,
      state: JSON.stringify({ ...JSON.parse(b.state), version: 1, nextPreKey: 2, signedId: 1 }),
      peerIdentity: a.result.identity,
      type: wire.result.type,
      message: wire.result.message,
    };
    writeFileSync(directory + '/input.json', JSON.stringify(fixture), { mode: 0o600 });
    writeFileSync(
      directory + '/node-state.json',
      JSON.stringify({
        state: wire.state,
        own: peer,
        peer: own,
        expectedIdentity: b.result.identity,
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      directory + '/entry.js',
      "import {registerSignalProbe} from '../../tests/native/signal-probe';\nimport fixture from './input.json';\nregisterSignalProbe(fixture);\n",
      { mode: 0o600 },
    );
    console.log(
      'NATIVE_PROBE_FIXTURES_READY: synthetic in-memory identities only; simulator-only entry, never a distribution build',
    );
  } else if (process.argv[2] === 'verify' && process.argv[3]) {
    const report = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    if (report.status !== 'PASS' || !report.reply) throw new Error('NATIVE_PROBE_DID_NOT_PASS');
    const saved = JSON.parse(readFileSync(directory + '/node-state.json', 'utf8'));
    const result = await signal.decrypt(saved.state as SignalState, {
      own: saved.own,
      peer: saved.peer,
      expectedIdentity: saved.expectedIdentity,
      type: report.reply.type,
      message: report.reply.message,
    });
    if (Buffer.from(result.result.message, 'base64').toString() !== 'MNELO_NATIVE_INTEROP_OUT')
      throw new Error('NATIVE_INTEROP_REPLY_INVALID');
    console.log(
      JSON.stringify({
        status: 'PASS',
        nativeChecks: report.checks,
        platform: report.platform ?? 'ios',
        additionalCheck: 'Native-to-Node Rust-backed Signal reply decrypted',
      }),
    );
  } else throw new Error('NATIVE_PROBE_COMMAND_REQUIRED');
}
void main().catch(() => {
  console.error('NATIVE_PROBE_FAILED');
  process.exitCode = 1;
});
