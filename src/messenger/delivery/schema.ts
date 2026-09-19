import { z } from 'zod';
import { peerKey } from '../model';
import { mediaCommands, mediaResponse } from './media-schema';
import { wakeEvent } from '../wake-protocol';

// Public wire types only. Signal private/session records must never be imported
// into a server request schema or included in a push payload.
export const DELIVERY_VERSION = 2;
export const DELIVERY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const base64 = (max: number) =>
  z
    .string()
    .min(4)
    .max(max)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const keyId = z.number().int().min(1).max(0x7fffffff);
export const signedSignalKey = z
  .object({
    id: keyId,
    key: base64(44).length(44),
    signature: base64(88).length(88),
  })
  .strict();
export const oneTimeSignalKey = z
  .object({
    id: keyId,
    key: base64(44).length(44),
    // libsignal's serialized Kyber-1024 key is 1 type byte + 1,568 key bytes.
    kyber: signedSignalKey.extend({ key: base64(2092).length(2092) }),
  })
  .strict();
export const publicSignalIdentity = z
  .object({
    identity: base64(44).length(44),
    registration: z.number().int().min(1).max(16383),
    device: z.literal(1),
    signed: signedSignalKey,
  })
  .strict();
export const signalBundle = publicSignalIdentity.extend({ oneTime: oneTimeSignalKey });
export const publishedSignalKeys = publicSignalIdentity.extend({
  oneTime: z.array(oneTimeSignalKey).min(1).max(100),
});
export const signalBinding = z
  .object({
    owner: peerKey,
    identity: base64(44).length(44),
    registration: z.number().int().min(1).max(16383),
    device: z.literal(1),
  })
  .strict();
export function signalBindingPayload(value: z.infer<typeof signalBinding>) {
  return JSON.stringify(['mnelo-signal-identity-v2', signalBinding.parse(value)]);
}
export const deliveryEnvelope = z
  .object({
    version: z.literal(DELIVERY_VERSION),
    id: z.string().uuid(),
    createdAt: z.number().int().nonnegative().max(8640000000000000),
    recipient: peerKey,
    type: z.union([z.literal(2), z.literal(3)]),
    ciphertext: base64(90_000),
    notify: wakeEvent.optional(),
  })
  .strict();
export const queuedEnvelope = deliveryEnvelope.extend({
  sender: peerKey,
  acceptedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type DeliveryEnvelope = z.infer<typeof deliveryEnvelope>;
export type QueuedEnvelope = z.infer<typeof queuedEnvelope>;
export type SignalBundle = z.infer<typeof signalBundle>;
export type PublishedSignalKeys = z.infer<typeof publishedSignalKeys>;

export const signalDirectoryIdentity = publicSignalIdentity.extend({
  owner: peerKey,
  signature: z.string().regex(/^[a-f0-9]{128}$/),
});
export const deliveryCursor = z
  .object({ acceptedAt: z.number().int().nonnegative(), sender: peerKey, id: z.string().uuid() })
  .strict();
export const deliveryAcknowledgement = z
  .object({ sender: peerKey, id: z.string().uuid() })
  .strict();
export const deliveryCommands = [
  ...mediaCommands,
  z
    .object({ action: z.literal('delivery-status'), capabilities: z.literal(true).optional() })
    .strict(),
  z
    .object({
      action: z.literal('delivery-sync'),
      envelope: deliveryEnvelope.optional(),
      acknowledgements: z.array(deliveryAcknowledgement).max(20),
      after: deliveryCursor.optional(),
      receive: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('delivery-publish'),
      keys: publishedSignalKeys,
      signature: z.string().regex(/^[a-f0-9]{128}$/),
    })
    .strict(),
  z.object({ action: z.literal('delivery-identity'), peer: peerKey }).strict(),
  z
    .object({
      action: z.literal('delivery-verify-sender'),
      peer: peerKey,
      id: z.string().uuid(),
      phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    })
    .strict(),
  z
    .object({ action: z.literal('delivery-keys'), peer: peerKey, request: z.string().uuid() })
    .strict(),
  z.object({ action: z.literal('delivery-submit'), envelope: deliveryEnvelope }).strict(),
  z.object({ action: z.literal('delivery-inbox'), after: deliveryCursor.optional() }).strict(),
  z.object({ action: z.literal('delivery-ack'), sender: peerKey, id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('delivery-block'), peer: peerKey, blocked: z.boolean() }).strict(),
] as const;
export const deliveryCommand = z.discriminatedUnion('action', deliveryCommands);
export type DeliveryCommand = z.infer<typeof deliveryCommand>;
export const deliveryResponse = z
  .object({
    version: z.literal(2),
    availableKeys: z.number().int().min(0).max(200).optional(),
    sync: z.literal(true).optional(),
    identity: signalDirectoryIdentity.nullable().optional(),
    keys: z
      .object({ bundle: signalBundle, signature: z.string().regex(/^[a-f0-9]{128}$/) })
      .strict()
      .nullable()
      .optional(),
    accepted: z
      .object({ acceptedAt: z.number().int(), expiresAt: z.number().int() })
      .strict()
      .optional(),
    inbox: z.array(queuedEnvelope).max(20).optional(),
    ok: z.literal(true).optional(),
    media: mediaResponse.optional(),
    verified: z.boolean().optional(),
  })
  .strict();
export type DeliveryResponse = z.infer<typeof deliveryResponse>;
