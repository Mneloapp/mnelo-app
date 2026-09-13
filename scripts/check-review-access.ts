import assert from 'node:assert/strict';
import { readFileSync, lstatSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { createKeys, sign } from '../src/messenger/crypto';
import { PhoneClient } from '../src/messenger/phone-client';
import { authenticationPayload, signSignal } from '../src/messenger/signaling';
import { reviewPhones } from '../src/messenger/review-account';

async function main() {
  if (process.argv.slice(2).join(' ') !== '--development-review-only')
    throw new Error('EXPLICIT_REVIEW_CHECK_REQUIRED');
  const file = join(homedir(), '.config/mnelo/apple-review/private-instructions.json');
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.mode & 0o077)
    throw new Error('REVIEW_CREDENTIAL_FILE_UNSAFE');
  const config = z
    .object({
      expiresAt: z.number().int().gt(Date.now()),
      accounts: z
        .array(
          z.object({ phone: z.enum(reviewPhones), accessKey: z.string().regex(/^[a-f0-9]{32}$/) }),
        )
        .length(2),
    })
    .parse(JSON.parse(readFileSync(file, 'utf8')));
  if (new Set(config.accounts.map((a) => a.phone)).size !== 2)
    throw new Error('REVIEW_CONFIGURATION_INVALID');
  const own = config.accounts.map(() => createKeys(randomBytes));
  const clients = own.map((key) => new PhoneClient('https://identity-dev.mnelo.com', key));
  const attempted: number[] = [],
    sockets: WebSocket[] = [];
  const next = async (socket: WebSocket) =>
    JSON.parse(
      (await once(socket, 'message', { signal: AbortSignal.timeout(10000) }))[0].toString(),
    );
  let cleaned = true;
  try {
    for (let i = 0; i < 2; i++) {
      const account = config.accounts[i]!;
      const sent = await clients[i]!.execute({ action: 'send', phone: account.phone });
      assert.equal(sent.reviewAccount, true);
      assert.equal(sent.testOnly, true);
      attempted.push(i);
      const verified = await clients[i]!.execute({
        action: 'verify',
        attempt: sent.attempt!,
        code: account.accessKey,
        discoverable: true,
      });
      assert.equal(verified.registered, true);
      const socket = new WebSocket('wss://relay-dev.mnelo.com/');
      sockets.push(socket);
      const challenge = await next(socket),
        ready = next(socket),
        key = own[i]!;
      socket.send(
        JSON.stringify({
          type: 'auth',
          key: key.key,
          signature: sign(key.secret, authenticationPayload(key.key, challenge.nonce)),
        }),
      );
      assert.equal((await ready).type, 'ready');
    }
    for (let i = 0; i < 2; i++) {
      const target = (i + 1) % 2;
      assert.deepEqual(
        await clients[i]!.execute({ action: 'lookup', phone: config.accounts[target]!.phone }),
        { key: own[target]!.key },
      );
      assert.ok((await clients[i]!.execute({ action: 'ice' })).ice);
      const response = next(sockets[i]!);
      sockets[i]!.send(JSON.stringify({ type: 'probe', to: own[target]!.key }));
      assert.equal((await response).online, true);
      for (const purpose of ['message', 'call'] as const) {
        const envelope = signSignal(own[i]!.secret, {
          protocol: 'mnelo-dtls-v1',
          from: own[i]!.key,
          to: own[target]!.key,
          session: randomUUID(),
          type: 'offer',
          purpose,
          sdp: 'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'),
          expires: Date.now() + 60000,
        });
        const received = next(sockets[target]!);
        sockets[i]!.send(JSON.stringify({ type: 'signal', to: own[target]!.key, envelope }));
        assert.deepEqual((await received).envelope, envelope);
      }
    }
  } finally {
    for (const socket of sockets) socket.terminate();
    for (const index of attempted) {
      // Unlink only the synthetic key just enrolled by this process. Never query,
      // modify, or reset a real tester or another reviewer's pinned identity.
      try {
        await clients[index]!.execute({ action: 'unlink' });
      } catch (error) {
        if (!(error instanceof Error && error.message === 'PHONE_REGISTRATION_REQUIRED'))
          cleaned = false;
      }
    }
    if (!cleaned) {
      mkdirSync('.local/hosting', { recursive: true, mode: 0o700 });
      writeFileSync(
        '.local/hosting/review-check-cleanup.json',
        JSON.stringify({
          publicKeys: attempted.map((index) => own[index]!.key),
          instruction:
            'Only these newly generated synthetic public keys may require cleanup. No device private key was saved.',
        }),
        { mode: 0o600 },
      );
      throw new Error('REVIEW_TEST_CLEANUP_REQUIRED');
    }
  }
  process.stdout.write(
    'PASS: two hosted review enrollments, HTTPS lookup/TURN, signed WSS message/call offers in both directions, and self-unlink cleanup. No SMS, APNs push, real tester access or physical media.\n',
  );
}
void main().catch(() => {
  process.stderr.write(
    'REVIEW_ACCESS_CHECK_FAILED: no credentials printed; inspect scoped state before retrying.\n',
  );
  process.exitCode = 1;
});
