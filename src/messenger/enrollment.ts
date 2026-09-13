import { z } from 'zod';
import { internationalPhone, phoneServiceAddress } from './phone-protocol';
import { permitsReviewAccount } from './review-account';

export const phoneEnrollment = z
  .object({
    phone: internationalPhone,
    service: z.string().url(),
    testOnly: z.boolean(),
    verifiedAt: z.number().int().positive(),
  })
  .strict();
export type PhoneEnrollment = z.infer<typeof phoneEnrollment>;

export function enrollmentAllowsAccess(
  identity: { key: string } | null,
  enrollment: PhoneEnrollment | null,
  service: string | undefined,
  environment: string | undefined,
) {
  if (!identity || !enrollment) return false;
  const local = (environment || 'local') === 'local';
  try {
    return (
      (!enrollment.testOnly ||
        local ||
        permitsReviewAccount(enrollment.phone, service, environment)) &&
      enrollment.service === phoneServiceAddress(service, local)
    );
  } catch {
    return false;
  }
}
