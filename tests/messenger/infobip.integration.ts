import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infobipSms, infobipConfiguration } from '../../identity/infobip';
import { phoneProvider, phoneProviderMode } from '../../identity/provider';

const config = {
  baseUrl: 'https://mnelo-test.api.infobip.com',
  apiKey: 'development-test-infobip-key',
  applicationId: 'test-application',
  messageId: 'test-template',
};
const phone = '+12025550101';
const id = 'development-pin-id';
const application = {
  applicationId: config.applicationId,
  enabled: true,
  configuration: { pinAttempts: 5, allowMultiplePinVerifications: false, pinTimeToLive: '10m' },
};
const template = {
  applicationId: config.applicationId,
  messageId: config.messageId,
  pinType: 'NUMERIC',
  pinLength: 6,
};
const sent = { pinId: id, to: phone.slice(1), smsStatus: 'MESSAGE_SENT' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const env = {
  INFOBIP_BASE_URL: config.baseUrl,
  INFOBIP_API_KEY: config.apiKey,
  INFOBIP_2FA_APPLICATION_ID: config.applicationId,
  INFOBIP_2FA_MESSAGE_ID: config.messageId,
};
function setupResponse(url: string) {
  if (url.includes('/messages/')) return template;
  if (url.includes('/applications/')) return application;
  return sent;
}

test('Infobip selection is explicit and missing credentials never fall back to another provider', () => {
  assert.deepEqual(infobipConfiguration(env), config);
  assert.equal(phoneProviderMode(['--infobip']), '--infobip');
  assert.equal(phoneProvider('--infobip', env).testOnly, false);
  for (const args of [
    ['--infobip', '--fixture'],
    ['--infobip', '--vonage'],
  ])
    assert.throws(() => phoneProviderMode(args), /IDENTITY_MODE_REQUIRED/);
  for (const name of Object.keys(env))
    assert.throws(
      () => phoneProvider('--infobip', { ...env, [name]: '' }),
      /IDENTITY_CONFIGURATION_INVALID/,
    );
  assert.throws(
    () => phoneProvider('--infobip', { TWILIO_AUTH_TOKEN: 'test-only' }),
    /IDENTITY_CONFIGURATION_INVALID/,
  );
});

test('Infobip validates remote policy, sends only SMS and binds approval to the exact PIN', async () => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const provider = infobipSms(config, async (url, init) => {
    requests.push({ url: String(url), init });
    return json(
      String(url).endsWith('/verify')
        ? { pinId: id, msisdn: phone.slice(1), verified: true, attemptsRemaining: 0 }
        : setupResponse(String(url)),
    );
  });
  assert.equal(await provider.send(phone), id);
  assert.equal(await provider.check(id, '123456'), true);
  assert.deepEqual(
    requests.map(({ url, init }) => [url, init?.method]),
    [
      [config.baseUrl + '/2fa/2/applications/test-application', 'GET'],
      [config.baseUrl + '/2fa/2/applications/test-application/messages/test-template', 'GET'],
      [config.baseUrl + '/2fa/2/pin?ncNeeded=false', 'POST'],
      [config.baseUrl + '/2fa/2/pin/' + id + '/verify', 'POST'],
    ],
  );
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    applicationId: config.applicationId,
    messageId: config.messageId,
    to: phone.slice(1),
    trackDelivery: false,
  });
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), { pin: '123456' });
  for (const { url, init } of requests) {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'App ' + config.apiKey);
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.ok(!url.includes(config.apiKey));
    assert.ok(!String(init?.body).includes(config.apiKey));
  }
  // Configuration reads and sending share one deadline shorter than the mobile HTTP timeout.
  assert.equal(requests[0]?.init?.signal, requests[2]?.init?.signal);
});

test('Infobip readiness check only reads configuration and sends no SMS', async () => {
  let calls = 0;
  await infobipSms(config, async (url, init) => {
    calls++;
    assert.equal(init?.method, 'GET');
    return json(setupResponse(String(url)));
  }).validateSetup();
  assert.equal(calls, 2);
});

test('unsafe, mismatched or non-six-digit remote configuration fails before sending', async () => {
  for (const [app, message] of [
    [{ ...application, enabled: false }, template],
    [{ ...application, applicationId: 'wrong-app' }, template],
    [
      {
        ...application,
        configuration: { ...application.configuration, allowMultiplePinVerifications: true },
      },
      template,
    ],
    [
      { ...application, configuration: { ...application.configuration, pinAttempts: 10 } },
      template,
    ],
    [
      { ...application, configuration: { ...application.configuration, pinTimeToLive: '1h' } },
      template,
    ],
    [application, { ...template, pinLength: 4 }],
    [application, { ...template, pinType: 'ALPHA' }],
    [application, { ...template, messageId: 'other-template' }],
    [application, { ...template, applicationId: 'other-app' }],
  ]) {
    const provider = infobipSms(config, async (url, init) => {
      assert.equal(init?.method, 'GET');
      return json(String(url).includes('/messages/') ? message : app);
    });
    await assert.rejects(provider.send(phone), { message: 'IDENTITY_CONFIGURATION_INVALID' });
  }
});

test('an Infobip send response must identify the requested destination and SMS acceptance', async () => {
  for (const result of [
    { ...sent, to: '12025550102' },
    { ...sent, smsStatus: 'MESSAGE_NOT_SENT' },
    { ...sent, pinId: '../other' },
    { pinId: id },
    { ...sent, smsStatus: 'PENDING' },
  ]) {
    const provider = infobipSms(config, async (url) =>
      json(String(url).includes('/applications/') ? setupResponse(String(url)) : result),
    );
    await assert.rejects(provider.send(phone), { message: 'PHONE_PROVIDER_UNAVAILABLE' });
  }
});

test('delivery, truthy values, other PINs and missing verification never approve an Infobip attempt', async () => {
  assert.equal(
    await infobipSms(config, async () => json({ pinId: id, verified: false })).check(id, '123456'),
    false,
  );
  for (const result of [
    sent,
    { verified: true },
    { pinId: 'other', verified: true },
    { pinId: id, verified: 'true' },
    { pinId: id, status: 'approved' },
  ]) {
    await assert.rejects(infobipSms(config, async () => json(result)).check(id, '123456'), {
      message: 'PHONE_PROVIDER_UNAVAILABLE',
    });
  }
});

test('Infobip transport, JSON and HTTP failures are redacted with no retry or channel fallback', async () => {
  for (const [status, expected] of [
    [400, 'PHONE_PROVIDER_UNAVAILABLE'],
    [401, 'PHONE_PROVIDER_UNAVAILABLE'],
    [403, 'PHONE_PROVIDER_UNAVAILABLE'],
    [404, 'PHONE_CODE_EXPIRED'],
    [429, 'PHONE_RATE_LIMITED'],
    [500, 'PHONE_PROVIDER_UNAVAILABLE'],
  ] as const) {
    let calls = 0;
    const provider = infobipSms(config, async () => {
      calls++;
      return json({ privateDetail: phone + config.apiKey }, status);
    });
    await assert.rejects(provider.check(id, '123456'), { message: expected });
    assert.equal(calls, 1);
  }
  for (const response of [
    () => new Response('private invalid JSON ' + phone),
    () => {
      throw new Error(config.apiKey + phone);
    },
  ]) {
    let calls = 0;
    await assert.rejects(
      infobipSms(config, async () => {
        calls++;
        return response();
      }).send(phone),
      { message: 'PHONE_PROVIDER_UNAVAILABLE' },
    );
    assert.equal(calls, 1);
  }
});

test('Infobip rejects credential exfiltration URLs and malformed input before any request', async () => {
  for (const baseUrl of [
    'http://api.infobip.com',
    'https://api.infobip.com.evil.test',
    'https://evil.test',
    'https://api.infobip.com@evil.test',
    'https://user:pass@api.infobip.com',
    'https://api.infobip.com:8080',
    'https://api.infobip.com/path',
    'https://api.infobip.com?key=private',
    'https://api.infobip.com#fragment',
  ])
    assert.throws(() => infobipSms({ ...config, baseUrl }), /IDENTITY_CONFIGURATION_INVALID/);
  let calls = 0;
  const provider = infobipSms(config, async () => {
    calls++;
    return json(sent);
  });
  for (const [pin, code] of [
    ['../other', '123456'],
    [id, '12345x'],
    [id, '12345'],
  ])
    await assert.rejects(provider.check(pin!, code!), /PHONE_REQUEST_FAILED/);
  await assert.rejects(provider.send('2025550101'), /PHONE_REQUEST_FAILED/);
  assert.equal(calls, 0);
});
