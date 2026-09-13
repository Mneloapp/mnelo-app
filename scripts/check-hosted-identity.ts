import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createKeys } from '../src/messenger/crypto';
import { PhoneClient } from '../src/messenger/phone-client';

async function main() {
  const [flag, address] = process.argv.slice(2);
  if (process.argv.length !== 4 || flag !== '--url' || address !== 'https://identity-dev.mnelo.com')
    throw new Error('EXPLICIT_DEVELOPMENT_IDENTITY_URL_REQUIRED');
  const keys = createKeys(randomBytes);
  const client = new PhoneClient(address, keys);
  // These actions cannot send/verify OTP, create a registration or alter a real account.
  assert.deepEqual(await client.execute({ action: 'status' }), {
    registered: false,
    discoverable: false,
  });
  await assert.rejects(
    client.execute({ action: 'lookup', phone: '+12025550101' }),
    /PHONE_REGISTRATION_REQUIRED/,
  );
  await assert.rejects(client.execute({ action: 'ice' }), /PHONE_REGISTRATION_REQUIRED/);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(address + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  const nonce = (await (await post('/challenge', { key: keys.key })).json()) as { nonce: string };
  const denied = await post('/execute', {
    key: keys.key,
    nonce: nonce.nonce,
    signature: '00'.repeat(64),
    command: { action: 'status' },
  });
  assert.equal(denied.status, 400);
  assert.deepEqual(await denied.json(), { code: 'PHONE_UNAUTHORIZED' });
  assert.equal((await post('/messages', {})).status, 404);
  assert.equal(
    (await post('/challenge', { key: keys.key }, { Origin: 'https://example.com' })).status,
    400,
  );
  // A gateway that passes our forged addresses would give every request a new quota.
  let allowed = 0,
    limited = false;
  for (let i = 1; i <= 125; i++) {
    const response = await post(
      '/challenge',
      { key: keys.key },
      { 'X-Mnelo-Client-IP': `198.51.100.${i}`, 'X-Forwarded-For': `198.51.100.${i}` },
    );
    await response.arrayBuffer();
    if (response.status === 429) {
      limited = true;
      break;
    }
    assert.equal(response.status, 200);
    allowed++;
  }
  assert.ok(limited && allowed >= 80, 'gateway source quota must reject rotating forged addresses');
  process.stdout.write(
    'PASS: HTTPS signed status, unregistered lookup/TURN denied, forged proof denied, no content endpoint, browser origin denied, proxy-header quota bypass denied. No SMS sent or account created.\n',
  );
}
void main().catch(() => {
  process.stderr.write('HOSTED_IDENTITY_CHECK_FAILED\n');
  process.exitCode = 1;
});
