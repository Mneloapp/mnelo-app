import { repositoryError } from '@/services/supabase/errors';
it('maps OTP and auth rate errors to stable nonenumerating codes', () => {
  expect(repositoryError({ code: 'otp_expired', message: 'private response' }).code).toBe(
    'EXPIRED',
  );
  expect(repositoryError({ status: 429 }).code).toBe('RATE_LIMITED');
  expect(repositoryError({ code: 'refresh_token_not_found' }).code).toBe('UNAUTHORIZED');
});
it('never exposes arbitrary backend details through a repository error', () => {
  const error = repositoryError({
    code: 'unexpected',
    message: 'private diagnostic with sensitive content',
  });
  expect(error.message).toBe('UNAVAILABLE');
});
it('does not treat an arbitrary server message as an application authorization code', () => {
  expect(repositoryError({ code: 'unexpected', message: 'RATE_LIMITED' }).code).toBe('UNAVAILABLE');
  expect(repositoryError({ code: 'P0001', message: 'RATE_LIMITED' }).code).toBe('RATE_LIMITED');
});

it('maps only the explicit expired-request code and hides server details', () => {
  expect(repositoryError({ code: '22023', message: 'EXPIRED' }).code).toBe('EXPIRED');
  expect(repositoryError({ code: '22023', message: 'private request detail' }).code).toBe(
    'INVALID',
  );
});
