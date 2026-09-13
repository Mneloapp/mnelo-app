import { load } from '@expo/env';
import { messengerEnvironment } from '../src/messenger/environment';
load(process.cwd(), { silent: true });
const env = messengerEnvironment({
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  relayUrl: process.env.EXPO_PUBLIC_RELAY_URL,
  phoneIdentityUrl: process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
});
const allowed = new Set([
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_RELAY_URL',
  'EXPO_PUBLIC_PHONE_IDENTITY_URL',
]);
const legacy = new Set([
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_LIVEKIT_URL',
]);
const unexpected = Object.keys(process.env).filter(
  (key) =>
    key.startsWith('EXPO_PUBLIC_') &&
    !allowed.has(key) &&
    !(env.appEnv === 'local' && legacy.has(key)),
);
if (unexpected.length) throw new Error('CONFIG_UNEXPECTED_PUBLIC_VARIABLE');
console.log(
  `Messenger environment passed (${env.appEnv}). Legacy local fixtures cannot activate the app backend; values omitted.`,
);
