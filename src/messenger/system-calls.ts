import type { DeviceCalls, DeviceCall } from './calls';
import type { PhoneClient } from './phone-client';
export function observeSystemCalls(
  _calls: DeviceCalls,
  _phone: PhoneClient,
  _caller?: (call: DeviceCall) => Promise<{ name: string; phone: string } | null>,
) {
  return () => undefined;
}
export function systemCallAudio() {
  return false;
}

export async function systemCallSpeaker(_enabled: boolean) {
  return false;
}
export async function prepareSystemCallAudio(_speaker: boolean) {
  return false;
}
export async function cacheSystemCallContact(_peer: string, _name: string, _phone = '') {}
export async function clearSystemCallAccount() {}
