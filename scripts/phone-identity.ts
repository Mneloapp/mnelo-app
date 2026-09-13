import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { PhoneRegistry } from '../identity/registry';
import { PhoneService } from '../identity/service';
import { phoneProvider, phoneProviderMode } from '../identity/provider';
import { startPhoneHttp } from '../identity/http';
import { DevelopmentSmsGuard } from '../identity/development-guard';
import { turnIssuer } from '../identity/turn';
import { ApplePushProvider, ApplePushEnvironments } from '../notifications/apns';
import { WakeRegistry } from '../notifications/registry';
import { WakeService } from '../notifications/service';
import { FirebasePushProvider, PushProviders } from '../notifications/fcm';
import { readPushCredential } from '../notifications/credential';
import { IdentityAccess, ReviewAccess } from '../identity/review-access';
import { startRelay } from '../relay/server';
import { DeliveryStore } from '../identity/delivery-store';
import { SignalDirectory } from '../identity/signal-directory';
import { DeliveryService } from '../identity/delivery-service';
import { DeliveryNotificationWorker } from '../notifications/delivery-worker';
import { MediaStore } from '../identity/media-store';
process.umask(0o077);
// Kept separate from all legacy Supabase fixtures and from the content-free relay.
const mode = phoneProviderMode(process.argv.slice(2));
const fixture = mode === '--fixture';
const hosted = process.env.MNELO_HOSTED_IDENTITY === 'development';
if (process.env.MNELO_HOSTED_IDENTITY && !hosted) throw new Error('IDENTITY_CONFIGURATION_INVALID');
if (hosted && mode !== '--infobip') throw new Error('HOSTED_IDENTITY_REQUIRES_INFOBIP');
const combinedRelay = process.env.MNELO_COMBINED_RELAY === '1';
if (process.env.MNELO_COMBINED_RELAY && (!hosted || !combinedRelay))
  throw new Error('IDENTITY_CONFIGURATION_INVALID');
if (process.env.MNELO_REVIEW_ACCESS_FILE && (!hosted || !combinedRelay))
  throw new Error('REVIEW_REQUIRES_ISOLATED_HOSTED_ROUTING');
// Validate the selected provider before creating any local state. Never fall back silently.
const provider = phoneProvider(mode, process.env);
const turn = process.env.MNELO_TURN_SECRET
  ? turnIssuer(process.env.MNELO_TURN_SECRET, process.env.MNELO_TURN_HOST ?? '')
  : undefined;
const directory = join(process.cwd(), '.local', fixture ? 'phone-fixture' : 'phone-sms');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const keyPath = join(directory, 'index.key');
const databasePath = join(directory, 'identity.db');
if (!existsSync(keyPath)) {
  if (existsSync(databasePath)) throw new Error('IDENTITY_INDEX_KEY_MISSING');
  writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
}
const registry = new PhoneRegistry(new DatabaseSync(databasePath), readFileSync(keyPath));
const guard = hosted
  ? new DevelopmentSmsGuard(
      new DatabaseSync(join(directory, 'sms-budget.db')),
      process.env.MNELO_ALLOWED_PHONE_INDICES ?? '',
    )
  : undefined;
const review = process.env.MNELO_REVIEW_ACCESS_FILE
  ? new ReviewAccess(
      JSON.parse(readPushCredential(process.env.MNELO_REVIEW_ACCESS_FILE)),
      (phone) => registry.index(phone),
    )
  : undefined;
const access = guard
  ? new IdentityAccess(registry, (index) => guard.admits(index), review)
  : undefined;
let wakeRegistry: WakeRegistry | undefined;
let wake: WakeService | undefined;
let delivery: DeliveryService | undefined;
const canContact = (from: string, to: string) =>
  (!access || access.canContact(from, to)) && (!delivery || delivery.store.allowed(from, to));
let apple: ApplePushEnvironments | undefined, android: FirebasePushProvider | undefined;
const appleEnvironments: Partial<Record<'sandbox' | 'production', ApplePushProvider>> = {};
for (const [environment, file, keyId] of [
  ['sandbox', process.env.MNELO_APNS_SANDBOX_KEY_FILE, process.env.MNELO_APNS_SANDBOX_KEY_ID],
  [
    'production',
    process.env.MNELO_APNS_PRODUCTION_KEY_FILE,
    process.env.MNELO_APNS_PRODUCTION_KEY_ID,
  ],
] as const) {
  if (file && keyId)
    appleEnvironments[environment] = new ApplePushProvider(
      process.env.MNELO_APNS_TEAM_ID ?? '',
      keyId,
      readPushCredential(file),
    );
  else if (file || keyId) throw new Error('PUSH_CONFIGURATION_INVALID');
}
if (Object.keys(appleEnvironments).length) apple = new ApplePushEnvironments(appleEnvironments);
else if (process.env.MNELO_APNS_TEAM_ID) throw new Error('PUSH_CONFIGURATION_INVALID');
if (process.env.MNELO_FCM_CREDENTIAL_FILE)
  android = new FirebasePushProvider(
    JSON.parse(readPushCredential(process.env.MNELO_FCM_CREDENTIAL_FILE)),
  );
if (apple || android) {
  wakeRegistry = new WakeRegistry(new DatabaseSync(join(directory, 'push-routes.db')));
  wake = new WakeService(wakeRegistry, new PushProviders(apple, android), Date.now, canContact);
}
// Opt-in until both native clients have completed the migration. These databases
// are separate from OTP and push state; an update never recreates index.key.
if (process.env.MNELO_DELIVERY_V2 && process.env.MNELO_DELIVERY_V2 !== '1')
  throw new Error('DELIVERY_CONFIGURATION_INVALID');
delivery =
  process.env.MNELO_DELIVERY_V2 === '1'
    ? new DeliveryService(
        new DeliveryStore(new DatabaseSync(join(directory, 'delivery-spool.db')), {
          registered: (key) =>
            Boolean(registry.status(key)) && (!access || Boolean(access.scope(key))),
          canContact: (from, to) => !access || access.canContact(from, to),
        }),
        new SignalDirectory(new DatabaseSync(join(directory, 'signal-directory.db'))),
        new MediaStore(new DatabaseSync(join(directory, 'delivery-media.db')), {
          registered: (key) =>
            Boolean(registry.status(key)) && (!access || Boolean(access.scope(key))),
          canContact,
        }),
      )
    : undefined;
const expiry = delivery
  ? setInterval(() => {
      delivery?.store.prune();
      delivery?.directory.prune();
      delivery?.media?.prune();
    }, 60000)
  : undefined;
expiry?.unref();
const service = new PhoneService(registry, provider, Date.now, guard, turn, wake, access, delivery);
// Hosted identity admission and transient relay share one process so every route
// uses the current scope synchronously. The relay never reads or stores content.
const relay = combinedRelay
  ? startRelay(8084, { scope: (key) => access?.scope(key) ?? null, canContact })
  : undefined;
const notificationWorker =
  delivery && wake ? new DeliveryNotificationWorker(delivery.store, wake) : undefined;
if (delivery)
  delivery.onAccepted = (sender, recipient) => {
    relay?.deliveryAvailable(sender, recipient);
    notificationWorker?.wakeNow();
  };
notificationWorker?.start();
const server = startPhoneHttp(service, 8086, hosted);
server.on('listening', () =>
  process.stdout.write(
    fixture
      ? 'Mnelo phone identity on loopback 8086. FICTIONAL numbers only; no SMS sent.\n'
      : hosted
        ? 'Mnelo development identity on loopback 8086; admitted testers and durable SMS budgets.\n'
        : 'Mnelo phone identity on loopback 8086. SMS provider enabled; no public deployment.\n',
  ),
);
server.on('error', () => {
  process.stderr.write('IDENTITY_SERVER_UNAVAILABLE\n');
  process.exitCode = 1;
  void relay?.close();
});
relay?.server.on('error', () => {
  process.stderr.write('RELAY_UNAVAILABLE\n');
  server.close();
  server.closeAllConnections();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    notificationWorker?.stop();
    void relay?.close();
    server.close(() => {
      if (expiry) clearInterval(expiry);
      delivery?.close();
      registry.close();
      guard?.close();
      wakeRegistry?.close();
    });
    server.closeAllConnections();
  });
