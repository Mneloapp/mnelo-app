import { AppError, safeErrorRecord } from '@/lib/errors';
import { createQueryClient, shouldRetryQuery } from '@/lib/query-client';

it('omits private exception details and unknown objects from telemetry', () => {
  expect(safeErrorRecord(new Error('private message, OTP, token'))).toEqual({ code: 'UNEXPECTED' });
  expect(safeErrorRecord({ access_token: 'private' })).toEqual({ code: 'UNEXPECTED' });
  expect(safeErrorRecord(new AppError('FORBIDDEN'))).toEqual({ code: 'FORBIDDEN' });
});

it.each(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED'] as const)(
  'does not retry %s',
  (code) => {
    expect(shouldRetryQuery(0, new AppError(code))).toBe(false);
  },
);

it('bounds transient retries and disables automatic mutation replay', () => {
  expect(shouldRetryQuery(0, new AppError('REQUEST_TIMEOUT'))).toBe(true);
  expect(shouldRetryQuery(2, new AppError('REQUEST_TIMEOUT'))).toBe(false);
  const client = createQueryClient();
  expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  client.clear();
});
