import { z } from 'zod';

// Only TURN transports are returned: relay-only ICE avoids disclosing a device's
// local/public candidates to its peer. Credentials are short lived and memory only.
export const iceConfiguration = z
  .object({
    expires: z.number().int().positive(),
    iceServers: z
      .array(
        z
          .object({
            urls: z
              .array(z.string().regex(/^turns?:[a-z0-9.-]+:\d{2,5}\?transport=(udp|tcp)$/))
              .min(1)
              .max(3),
            username: z.string().regex(/^\d{10,12}:[a-f0-9]{32}$/),
            credential: z.string().regex(/^[A-Za-z0-9+/]{27}=$/),
          })
          .strict(),
      )
      .length(1),
  })
  .strict();
export type IceConfiguration = z.infer<typeof iceConfiguration>;
