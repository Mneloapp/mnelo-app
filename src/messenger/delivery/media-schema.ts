import { z } from 'zod';
import { peerKey } from '../model';

export const MEDIA_CHUNK_BYTES = 128 * 1024;
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024 + 16; // GCM authentication tag included.
const canonical64 = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const cipherBlob = z
  .object({
    id: z.string().uuid(),
    recipient: peerKey,
    createdAt: z.number().int().nonnegative(),
    size: z.number().int().min(17).max(MEDIA_MAX_BYTES),
    parts: z
      .number()
      .int()
      .min(1)
      .max(Math.ceil(MEDIA_MAX_BYTES / MEDIA_CHUNK_BYTES)),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((value) => value.parts === Math.ceil(value.size / MEDIA_CHUNK_BYTES));
export type CipherBlob = z.infer<typeof cipherBlob>;
// This descriptor travels INSIDE a Signal message, never in the object API.
export const privateMediaDescriptor = z
  .object({
    version: z.literal(2),
    owner: peerKey,
    blob: cipherBlob,
    key: z.string().regex(/^[a-f0-9]{64}$/),
    nonce: z.string().regex(/^[a-f0-9]{24}$/),
  })
  .strict();
export type PrivateMediaDescriptor = z.infer<typeof privateMediaDescriptor>;
export const mediaCommands = [
  z.object({ action: z.literal('delivery-blob-begin'), blob: cipherBlob }).strict(),
  z
    .object({
      action: z.literal('delivery-blob-put'),
      id: z.string().uuid(),
      part: z.number().int().min(0).max(80),
      data: canonical64.min(4).max(Math.ceil(MEDIA_CHUNK_BYTES / 3) * 4),
    })
    .strict(),
  z.object({ action: z.literal('delivery-blob-finish'), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('delivery-blob-get'),
      owner: peerKey,
      id: z.string().uuid(),
      part: z.number().int().min(0).max(80),
    })
    .strict(),
  z
    .object({ action: z.literal('delivery-blob-ack'), owner: peerKey, id: z.string().uuid() })
    .strict(),
] as const;
export const mediaCommand = z.discriminatedUnion('action', mediaCommands);
export const mediaResponse = z
  .object({
    present: z.array(z.number().int().min(0).max(80)).max(81).optional(),
    complete: z.boolean().optional(),
    data: canonical64
      .min(4)
      .max(Math.ceil(MEDIA_CHUNK_BYTES / 3) * 4)
      .optional(),
  })
  .strict();
