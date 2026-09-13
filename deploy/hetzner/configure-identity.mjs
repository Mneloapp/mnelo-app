import { readFileSync, writeFileSync, mkdirSync, existsSync, chownSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';

// One-time root bootstrap for a NEW development identity service. Read private
// configuration through encrypted SSH stdin; never pass it in argv or user-data.
try {
  if (process.getuid() !== 0) throw new Error();
  process.umask(0o077);
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 16384) throw new Error();
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const fields = [
    'INFOBIP_BASE_URL',
    'INFOBIP_API_KEY',
    'INFOBIP_2FA_APPLICATION_ID',
    'INFOBIP_2FA_MESSAGE_ID',
  ];
  if (Object.keys(data).some((key) => ![...fields, 'phones'].includes(key))) throw new Error();
  if (
    !Array.isArray(data.phones) ||
    data.phones.length < 1 ||
    data.phones.length > 50 ||
    new Set(data.phones).size !== data.phones.length ||
    data.phones.some((phone) => typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone))
  )
    throw new Error();
  if (
    fields.some((key) => typeof data[key] !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(data[key]))
  )
    throw new Error();
  const url = new URL(data.INFOBIP_BASE_URL);
  if (
    url.protocol !== 'https:' ||
    !/^(?:[a-z0-9-]+\.)?api\.infobip\.com$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error();
  if (
    existsSync('/etc/mnelo/identity.env') ||
    existsSync('/var/lib/mnelo-identity/.local/phone-sms/identity.db')
  )
    throw new Error();
  const uid = Number(execFileSync('id', ['-u', 'mnelo-identity'], { encoding: 'utf8' }).trim());
  const gid = Number(execFileSync('id', ['-g', 'mnelo-identity'], { encoding: 'utf8' }).trim());
  const directory = '/var/lib/mnelo-identity/.local/phone-sms';
  for (const path of ['/var/lib/mnelo-identity', '/var/lib/mnelo-identity/.local', directory]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chownSync(path, uid, gid);
  }
  const keyPath = directory + '/index.key';
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error();
  chownSync(keyPath, uid, gid);
  const indices = data.phones.map((phone) =>
    createHmac('sha256', key)
      .update('mnelo-phone-index-v1:' + phone)
      .digest('hex'),
  );
  const env = {
    ...Object.fromEntries(fields.map((name) => [name, data[name]])),
    MNELO_HOSTED_IDENTITY: 'development',
    MNELO_ALLOWED_PHONE_INDICES: indices.join(','),
  };
  mkdirSync('/etc/mnelo', { recursive: true, mode: 0o700 });
  writeFileSync(
    '/etc/mnelo/identity.env',
    Object.entries(env)
      .map(([name, value]) => name + '=' + JSON.stringify(value))
      .join('\n') + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  process.stdout.write(
    'IDENTITY_CONFIGURATION_INSTALLED: private fields preserved; numbers not written; fresh development registry\n',
  );
} catch {
  process.stderr.write('IDENTITY_BOOTSTRAP_FAILED: no automatic overwrite or key rotation\n');
  process.exitCode = 1;
}
