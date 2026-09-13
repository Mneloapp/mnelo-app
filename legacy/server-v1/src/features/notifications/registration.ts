// Browser layout QA cannot register a mobile push token.
export type RegistrationStatus =
  'enabled' | 'disabled' | 'denied' | 'buildRequired' | 'unsupported';
export async function registerNotifications(
  _requestPermission: boolean,
): Promise<RegistrationStatus> {
  return 'unsupported';
}
export function usePushEvents() {}
