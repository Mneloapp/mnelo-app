/* global __dirname */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const { createHash } = require('node:crypto');
const config = getDefaultConfig(__dirname);

// Expo's production transform inlines these values. CI embedding preserves its
// transform cache, so a local/preview build must never reuse the other's output.
const publicEnvironment = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_RELAY_URL',
  'EXPO_PUBLIC_PHONE_IDENTITY_URL',
  'EXPO_PUBLIC_DELIVERY_V2',
].map((key) => [key, process.env[key] ?? null]);
const environmentHash = createHash('sha256')
  .update(JSON.stringify(publicEnvironment))
  .digest('hex');
config.cacheVersion = `${config.cacheVersion ?? ''}:${environmentHash}`;

// SDK 57's dev-only virtual env module loads .env files through require.context,
// independently of CLI loading. Keep explicit no-dotenv QA/build invocations isolated.
if (process.env.EXPO_NO_DOTENV === '1') {
  const prefix = path.join(__dirname, '.env').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocked = new RegExp('^' + prefix + '(?:\\.[^/\\\\]*)?$');
  const existing = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    blocked,
  ];
}
module.exports = config;
