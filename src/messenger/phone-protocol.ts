import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { peerKey } from './model';
import { iceConfiguration } from './ice-protocol';
import { wakeCommands } from './wake-protocol';
import { deliveryCommands, deliveryResponse } from './delivery/schema';

export const internationalPhone = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/)
  .refine((value) => parsePhoneNumberFromString(value)?.isValid() === true);
export function normalizeInternationalPhone(value: string): string {
  if (!/^[+\d ()-]{8,30}$/.test(value.trim()) || !value.trim().startsWith('+'))
    throw new Error('PHONE_INVALID');
  return internationalPhone.parse('+' + value.replace(/\D/g, ''));
}
export const phoneCommand = z.discriminatedUnion('action', [
  ...wakeCommands,
  ...deliveryCommands,
  z.object({ action: z.literal('send'), phone: internationalPhone }).strict(),
  z
    .object({
      action: z.literal('verify'),
      attempt: z.string().uuid(),
      code: z.string().regex(/^(?:\d{6}|[a-f0-9]{32})$/),
      discoverable: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('lookup'), phone: internationalPhone }).strict(),
  z.object({ action: z.literal('visibility'), discoverable: z.boolean() }).strict(),
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('ice') }).strict(),
  z.object({ action: z.literal('unlink') }).strict(),
]);
export type PhoneCommand = z.infer<typeof phoneCommand>;
export const phoneProof = z
  .object({
    key: peerKey,
    nonce: z.string().regex(/^[a-f0-9]{64}$/),
    signature: z.string().regex(/^[a-f0-9]{128}$/),
    command: phoneCommand,
  })
  .strict();
export function phoneProofPayload(key: string, nonce: string, command: PhoneCommand) {
  return JSON.stringify(['mnelo-phone-directory-v1', key, nonce, phoneCommand.parse(command)]);
}
export const phoneResponse = z
  .object({
    attempt: z.string().uuid().optional(),
    expires: z.number().optional(),
    retryAt: z.number().optional(),
    testOnly: z.boolean().optional(),
    reviewAccount: z.literal(true).optional(),
    registered: z.boolean().optional(),
    discoverable: z.boolean().optional(),
    key: peerKey.nullable().optional(),
    ok: z.boolean().optional(),
    ice: iceConfiguration.optional(),
    delivery: deliveryResponse.optional(),
  })
  .strict();
export type PhoneResponse = z.infer<typeof phoneResponse>;
export function phoneServiceAddress(raw: string | undefined, local: boolean) {
  if (!raw) return null;
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      url.protocol === 'https:' ||
      (local &&
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('PHONE_SERVICE_CONFIGURATION_INVALID');
  return url.origin;
}
