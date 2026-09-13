import { requireNativeModule } from 'expo-modules-core';
import { VendorSignal, type NativeSignalModule } from './signal';
export function nativeSignal() {
  return new VendorSignal(requireNativeModule<NativeSignalModule>('MneloSignal'));
}
