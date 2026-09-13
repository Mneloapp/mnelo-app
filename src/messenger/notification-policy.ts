import type { AlertKind } from './device-alerts';
export function alertKind(data: unknown): AlertKind | null {
  if (!data || typeof data !== 'object' || !('kind' in data)) return null;
  return data.kind === 'message' || data.kind === 'missed-call' || data.kind === 'incoming-call'
    ? data.kind
    : null;
}
export function shouldAlert(active: boolean, path: string, chat: string, kind: AlertKind) {
  return !(
    active &&
    ((kind === 'message' && path === '/chat/' + chat) ||
      (kind === 'missed-call' && path === '/calls'))
  );
}
