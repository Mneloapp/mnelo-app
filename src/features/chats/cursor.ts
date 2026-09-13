import { RepositoryError } from '@/services/repository';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function encodeCursor(createdAt: string, id: string) {
  return createdAt + '|' + id;
}
export function decodeCursor(cursor?: string) {
  if (!cursor) return {};
  const parts = cursor.split('|');
  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    parts[0].length > 40 ||
    !Number.isFinite(Date.parse(parts[0])) ||
    !uuid.test(parts[1])
  )
    throw new RepositoryError('INVALID');
  return { before_time: parts[0], before_id: parts[1] };
}
