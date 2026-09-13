import type { SignalProvider } from './signal';
export function nativeSignal(): SignalProvider {
  throw new Error('NATIVE_SIGNAL_REQUIRED');
}
