import { decodeCursor, encodeCursor } from '../src/features/chats/cursor';
const id = '12345678-1234-1234-1234-123456789abc';
it('retains PostgreSQL microseconds and UUID tie-breakers without Date truncation', () => {
  const time = '2026-09-07T10:10:00.123456+00:00';
  expect(decodeCursor(encodeCursor(time, id))).toEqual({ before_time: time, before_id: id });
});
it('rejects malformed cursor data before passing database parameters', () => {
  for (const cursor of [
    'invalid',
    'today|not-a-uuid',
    '2026-09-07|' + id + '|extra',
    'x'.repeat(100),
  ])
    expect(() => decodeCursor(cursor)).toThrow('INVALID');
});
it('uses an empty first-page cursor', () => {
  expect(decodeCursor()).toEqual({});
});
