export function notificationId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('notificationId' in data)) return null;
  return typeof data.notificationId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.notificationId)
    ? data.notificationId
    : null;
}
