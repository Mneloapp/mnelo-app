// Expo requires direct public env access for static inlining. No backend credentials.
export const messengerRuntime = { appEnv: process.env.EXPO_PUBLIC_APP_ENV || 'local' };
