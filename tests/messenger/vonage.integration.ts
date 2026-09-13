import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vonageSms } from '../../identity/vonage';
import { phoneProvider, phoneProviderMode } from '../../identity/provider';

const config = { apiKey: 'test-key', apiSecret: 'development-test-only' };
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const phone = '+12025550101';
const problem = (code: string) => ({
  type: `https://developer.vonage.com/api-errors/verify.v2#${code}`,
  detail: `private provider detail ${phone}`,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('SMS provider selection is explicit, credentials fail closed, and fixture cannot be mixed in', () => {
  for (const args of [[], ['--fixture', '--vonage'], ['--twilio', '--vonage'], ['--unknown']])
    assert.throws(() => phoneProviderMode(args), /IDENTITY_MODE_REQUIRED/);
  assert.equal(phoneProvider(phoneProviderMode(['--fixture']), {}).testOnly, true);
  assert.throws(
    () => phoneProvider('--vonage', { TWILIO_AUTH_TOKEN: 'test-only' }),
    /IDENTITY_CONFIGURATION_INVALID/,
  );
  assert.equal(
    phoneProvider('--vonage', {
      VONAGE_API_KEY: config.apiKey,
      VONAGE_API_SECRET: config.apiSecret,
    }).testOnly,
    false,
  );
});

test('Vonage V2 uses a single SMS workflow, six digits and header-only credentials', async () => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const provider = vonageSms(config, async (url, init) => {
    requests.push({ url: String(url), init });
    return requests.length === 1
      ? json({ request_id: id }, 202)
      : json({ request_id: id, status: 'completed' });
  });
  assert.equal(await provider.send(phone), id);
  assert.equal(await provider.check(id, '123456'), true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, 'https://api.nexmo.com/v2/verify');
  assert.equal(requests[1]?.url, 'https://api.nexmo.com/v2/verify/' + id);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    brand: 'Mnelo',
    code_length: 6,
    channel_timeout: 600,
    workflow: [{ channel: 'sms', to: phone.slice(1) }],
  });
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), { code: '123456' });
  for (const { url, init } of requests) {
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      'Basic ' + Buffer.from(config.apiKey + ':' + config.apiSecret).toString('base64'),
    );
    assert.ok(!url.includes(config.apiSecret));
    assert.ok(!String(init?.body).includes(config.apiSecret));
  }
});

test('Vonage approval requires completed status for the exact request ID', async () => {
  for (const status of ['pending', 'failed', 'expired', 'approved', undefined]) {
    const provider = vonageSms(config, async () => json({ request_id: id, status }));
    assert.equal(await provider.check(id, '123456'), false);
  }
  const wrongRequest = vonageSms(config, async () =>
    json({ request_id: other, status: 'completed' }),
  );
  await assert.rejects(wrongRequest.check(id, '123456'), /PHONE_PROVIDER_UNAVAILABLE/);
});

test('Vonage OTP errors are handled without leaking provider detail or treating delivery as approval', async () => {
  const invalid = vonageSms(config, async () => json(problem('invalid-code'), 400));
  assert.equal(await invalid.check(id, '123456'), false);
  for (const [code, status, expected] of [
    ['expired', 400, 'PHONE_CODE_EXPIRED'],
    ['request-not-found', 404, 'PHONE_CODE_EXPIRED'],
    ['concurrent', 409, 'PHONE_RATE_LIMITED'],
    ['invalid-code', 401, 'PHONE_PROVIDER_UNAVAILABLE'],
    ['out-of-credit', 403, 'PHONE_PROVIDER_UNAVAILABLE'],
    ['unexpected', 500, 'PHONE_PROVIDER_UNAVAILABLE'],
  ] as const) {
    const provider = vonageSms(config, async () => json(problem(code), status));
    await assert.rejects(provider.check(id, '123456'), { message: expected });
  }
  const throttled = vonageSms(config, async () => new Response('', { status: 429 }));
  await assert.rejects(throttled.send(phone), { message: 'PHONE_RATE_LIMITED' });
});

test('Vonage transport/JSON failures are redacted and do not automatically retry', async () => {
  for (const response of [
    () => new Response('not JSON', { status: 200 }),
    () => json({ request_id: '../../private', status: 'completed' }),
    () => json({ request_id: id, status: true }),
    () => {
      throw new Error('network detail ' + config.apiSecret + phone);
    },
  ]) {
    let calls = 0;
    const provider = vonageSms(config, async () => {
      calls++;
      return response();
    });
    await assert.rejects(provider.send(phone), { message: 'PHONE_PROVIDER_UNAVAILABLE' });
    assert.equal(calls, 1);
  }
});

test('invalid Vonage request IDs, codes and phone numbers never reach the provider', async () => {
  let calls = 0;
  const provider = vonageSms(config, async () => {
    calls++;
    return json({ request_id: id });
  });
  await assert.rejects(provider.check('../other', '123456'), /PHONE_REQUEST_FAILED/);
  await assert.rejects(provider.check(id, '12345a'), /PHONE_REQUEST_FAILED/);
  await assert.rejects(provider.send('2025550101'), /PHONE_REQUEST_FAILED/);
  assert.equal(calls, 0);
});
