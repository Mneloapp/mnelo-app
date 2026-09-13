import { AppRegistry } from 'react-native';
import { acquireDeviceEngine, acquireDeviceNetwork } from './device-runtime';
// Android's native incoming-call notification starts this bounded task. It shares
// the exact engine/network with an already open React app; never a second vault.
AppRegistry.registerHeadlessTask('MneloIncomingCall', () => async (data: unknown) => {
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') return;
  const id = data.id;
  const lease = await acquireDeviceEngine();
  let network: ReturnType<typeof acquireDeviceNetwork> = null;
  try {
    network = acquireDeviceNetwork(lease.engine, () => undefined);
    if (!network) return;
    const calls = network.calls;
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      const call = calls.snapshot();
      if (call?.id === id && ['ended', 'failed'].includes(call.status)) return;
      if (call?.id === id && call.status === 'active') {
        // The native Telecom call controls foreground execution, not a permanent
        // background loop. Its task is released as soon as that call ends.
        await new Promise<void>((resolve) => {
          const unsubscribe = calls.subscribe(() => {
            const current = calls.snapshot();
            if (current?.id !== id || ['ended', 'failed'].includes(current.status)) {
              unsubscribe();
              resolve();
            }
          });
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } finally {
    network?.release();
    lease.release();
  }
});
