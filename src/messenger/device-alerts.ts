// Web previews do not register push tokens or imitate OS delivery.
export type AlertKind = 'message' | 'missed-call' | 'incoming-call';
export type AlertPermission = {
  allowed: boolean;
  canAsk: boolean;
  supported: boolean;
  undetermined: boolean;
};
export async function alertPermission(): Promise<AlertPermission> {
  return { allowed: false, canAsk: false, supported: false, undetermined: false };
}
export const requestAlerts = alertPermission;
export async function enableAlertsByDefault(_isCurrent: () => boolean) {
  return alertPermission();
}
export async function showDeviceAlert(
  _id: string,
  _kind: AlertKind,
  _body: string,
  _title?: string,
) {}
export async function showForegroundDeviceAlert(
  _id: string,
  _kind: AlertKind,
  _body: string,
  _title: string,
  _isCurrent: () => boolean,
) {}
export async function dismissDeviceAlert(_id: string) {}
export async function presentedAlertIds(): Promise<string[]> {
  return [];
}
export async function setDeviceBadge(_count: number) {}
export function observeAlertTaps(_listener: (kind: AlertKind, messageId?: string) => void) {
  return () => {};
}
