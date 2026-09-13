// Reserved fictional NANP numbers. No real subscriber or access key is embedded.
export const reviewPhones = ['+12025550198', '+12025550199'] as const;
export function isReviewPhone(phone: string) {
  return (reviewPhones as readonly string[]).includes(phone);
}
export function permitsReviewAccount(phone: string, service: string | undefined, env?: string) {
  return env === 'preview' && service === 'https://identity-dev.mnelo.com' && isReviewPhone(phone);
}
