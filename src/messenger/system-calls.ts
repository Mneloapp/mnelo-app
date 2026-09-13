import type { DeviceCalls } from './calls';
import type { PhoneClient } from './phone-client';
export function observeSystemCalls(_calls: DeviceCalls, _phone: PhoneClient) {
  return () => undefined;
}
export function systemCallAudio() {
  return false;
}

export async function systemCallSpeaker(_enabled: boolean) {
  return false;
}
