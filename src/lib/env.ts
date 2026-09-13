import { parseEnvironment } from './env-schema';

// Expo only inlines direct EXPO_PUBLIC_ property access. Never spread process.env.
export const env = parseEnvironment({
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  livekitUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL,
});
