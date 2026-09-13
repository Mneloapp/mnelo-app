import { z } from 'zod';
// Push contains only an opaque event, not message content or participant identity.
export const wakeEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('call'), id: z.string().uuid(), video: z.boolean() }).strict(),
]);
export type WakeEvent = z.infer<typeof wakeEvent>;
export const wakeCapability = z.string().regex(/^[a-f0-9]{64}$/);
export const pushRegistration = z
  .object({
    platform: z.enum(['ios', 'android']).default('ios'),
    channel: z.enum(['alert', 'voip']),
    environment: z.enum(['sandbox', 'production']),
    token: z
      .string()
      .min(32)
      .max(1024)
      .regex(/^[A-Za-z0-9_:-]+$/),
  })
  .strict()
  .refine((value) =>
    value.platform === 'ios'
      ? /^[a-f0-9]{64,256}$/.test(value.token)
      : value.environment === 'production',
  );
export type PushRegistration = z.input<typeof pushRegistration>;
export const wakeCommands = [
  z.object({ action: z.literal('push-register'), registration: pushRegistration }).strict(),
  z.object({ action: z.literal('push-disable') }).strict(),
  z.object({ action: z.literal('wake-grant'), capability: wakeCapability }).strict(),
  z.object({ action: z.literal('wake-revoke'), capability: wakeCapability }).strict(),
  z.object({ action: z.literal('wake'), capability: wakeCapability, event: wakeEvent }).strict(),
] as const;

export const wakeGrantPacket = z
  .object({ type: z.literal('wake-grant'), capability: wakeCapability })
  .strict();
export type WakeGrantPacket = z.infer<typeof wakeGrantPacket>;
