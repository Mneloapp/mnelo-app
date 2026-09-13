/* global __dirname */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);

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
