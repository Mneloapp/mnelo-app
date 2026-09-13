import { createServer, type IncomingMessage } from 'node:http';
import { z } from 'zod';
import { isIP } from 'node:net';
import type { PhoneService } from './service';
import { peerKey } from '../src/messenger/model';
const safeErrors = new Set([
  'TURN_UNAVAILABLE',
  'PUSH_UNAVAILABLE',
  'PUSH_RATE_LIMITED',
  'PUSH_REGISTRATION_CONFLICT',
  'PHONE_RATE_LIMITED',
  'PHONE_UNAUTHORIZED',
  'PHONE_CODE_EXPIRED',
  'PHONE_CODE_INVALID',
  'PHONE_REGISTRATION_REQUIRED',
  'PHONE_PROVIDER_UNAVAILABLE',
  'FIXTURE_PHONE_REQUIRED',
  'IDENTITY_RECOVERY_REQUIRED',
  'DELIVERY_UNAVAILABLE',
  'DELIVERY_CAPACITY',
  'DELIVERY_EXPIRED',
  'DELIVERY_CONFLICT',
  'SIGNAL_IDENTITY_CHANGED',
  'SIGNAL_REGISTRATION_REQUIRED',
  'MEDIA_UNAVAILABLE',
  'MEDIA_CAPACITY',
  'MEDIA_EXPIRED',
  'MEDIA_CONFLICT',
  'MEDIA_INCOMPLETE',
  'MEDIA_SIZE_INVALID',
  'MEDIA_INTEGRITY_INVALID',
]);
async function json(request: IncomingMessage, maximum: number) {
  if (request.headers['content-type'] !== 'application/json') throw new Error('INVALID');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maximum) throw new Error('INVALID');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export function startPhoneHttp(service: PhoneService, port = 0, trustedLoopbackProxy = false) {
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 15000, headersTimeout: 10000 },
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      try {
        // No CORS. The hosted entry point trusts only the header overwritten by our
        // loopback reverse proxy; ordinary local runs never trust forwarding headers.
        if (
          req.method !== 'POST' ||
          req.headers.origin ||
          !['/challenge', '/execute', '/delivery'].includes(req.url ?? '')
        )
          throw new Error('INVALID');
        let source = req.socket.remoteAddress ?? 'unknown';
        if (trustedLoopbackProxy) {
          const forwarded = req.headers['x-mnelo-client-ip'];
          if (
            !['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(source) ||
            typeof forwarded !== 'string' ||
            !isIP(forwarded)
          )
            throw new Error('INVALID');
          source =
            isIP(forwarded) === 6
              ? new URL('http://[' + forwarded + ']').hostname.slice(1, -1)
              : forwarded;
        }
        const input = await json(req, req.url === '/delivery' ? 250000 : 4096);
        if (req.url !== '/challenge') {
          const action = z.object({ command: z.object({ action: z.string() }) }).parse(input)
            .command.action;
          if (action.startsWith('delivery-') !== (req.url === '/delivery'))
            throw new Error('INVALID');
        }
        const result =
          req.url === '/challenge'
            ? service.challenge(z.object({ key: peerKey }).strict().parse(input).key, source)
            : await service.execute(input, source);
        res.end(JSON.stringify(result));
      } catch (error) {
        const code =
          error instanceof Error && safeErrors.has(error.message)
            ? error.message
            : 'PHONE_REQUEST_FAILED';
        res.statusCode = code === 'PHONE_RATE_LIMITED' ? 429 : 400;
        res.end(JSON.stringify({ code }));
      }
    },
  );
  server.maxConnections = 128;
  server.listen(port, '127.0.0.1');
  return server;
}
