import { RepositoryError } from '@/services/repository';
export function repositoryError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  if (status === 429 || ['over_request_rate_limit', 'over_sms_send_rate_limit'].includes(code))
    return new RepositoryError('RATE_LIMITED');
  if (code === 'otp_expired') return new RepositoryError('EXPIRED');
  if (
    [
      'session_not_found',
      'refresh_token_not_found',
      'refresh_token_already_used',
      'bad_jwt',
    ].includes(code) ||
    status === 401
  )
    return new RepositoryError('UNAUTHORIZED');
  if (
    code === '42501' &&
    error &&
    typeof error === 'object' &&
    'message' in error &&
    error.message === 'UNAUTHORIZED'
  )
    return new RepositoryError('UNAUTHORIZED');
  if (code === '42501' || status === 403) return new RepositoryError('FORBIDDEN');
  const message =
    error && typeof error === 'object' && 'message' in error ? error.message : undefined;
  if (code === '22023' && message === 'EXPIRED') return new RepositoryError('EXPIRED');
  if (code === '23505') return new RepositoryError('CONFLICT');
  if (['22023', '23502', '23514', 'validation_failed', 'bad_json'].includes(code))
    return new RepositoryError('INVALID');
  // Only map our explicit database error codes; never render arbitrary server messages.
  if (code === 'P0001' && message === 'RATE_LIMITED') return new RepositoryError('RATE_LIMITED');
  return new RepositoryError('UNAVAILABLE');
}
