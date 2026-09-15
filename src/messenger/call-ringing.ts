import type { DeviceCall } from './calls';

export function isRemoteRinging(call: DeviceCall | null) {
  return Boolean(
    call &&
    !call.incoming &&
    call.status === 'ringing' &&
    (call.group
      ? call.participants?.some((person) => person.status === 'ringing' && person.ringingConfirmed)
      : call.ringingConfirmed),
  );
}
