import { requireOptionalNativeModule } from 'expo-modules-core';
const native = requireOptionalNativeModule<{
  timing?(stage: string, duration: number): Promise<void>;
}>('MneloCalls');

// Constant stage codes and durations only. Never include peer IDs, URLs,
// message bodies, SDP, key material or native error descriptions.
export function connectionTiming(stage: string, duration = 0) {
  if (!/^[A-Z_]{1,48}$/.test(stage) || !Number.isFinite(duration)) return;
  void native
    ?.timing?.(stage, Math.max(0, Math.min(60000, Math.round(duration))))
    .catch(() => undefined);
}
