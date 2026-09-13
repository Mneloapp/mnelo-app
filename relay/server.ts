import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { peerKey } from '../src/messenger/model';
import { authenticationPayload, readSignal } from '../src/messenger/signaling';
import { verify } from '../src/messenger/crypto';

const request = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('auth'),
      key: peerKey,
      signature: z.string().regex(/^[a-f0-9]{128}$/),
    })
    .strict(),
  z.object({ type: z.literal('probe'), to: peerKey }).strict(),
  z.object({ type: z.literal('signal'), to: peerKey, envelope: z.unknown() }).strict(),
]);

// The relay retains live routes only. Hosted authorization consults the identity
// registry through the supplied policy; no signal/content queue or payload log.
// The deployment must separately disable proxy logs, dumps, swap and snapshots.
export function startRelay(
  port = 0,
  access?: {
    scope(key: string): string | null;
    canContact(from: string, to: string): boolean;
  },
) {
  const clients = new Map<string, WebSocket>();
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port,
    maxPayload: 96_000,
    perMessageDeflate: false,
  });
  server.on('connection', (socket) => {
    if (server.clients.size > 256) {
      socket.close(1013);
      return;
    }
    let identity: string | null = null;
    const nonce = randomBytes(32).toString('hex');
    let windowStart = Date.now(),
      count = 0;
    const deadline = setTimeout(() => {
      if (!identity) socket.close(1008);
    }, 5000);
    socket.send(JSON.stringify({ type: 'challenge', nonce }));
    socket.on('message', (bytes, isBinary) => {
      try {
        if (isBinary) {
          socket.close(1008);
          return;
        }
        const now = Date.now();
        if (now - windowStart > 60_000) {
          windowStart = now;
          count = 0;
        }
        if (++count > 240) {
          socket.close(1008);
          return;
        }
        const value = request.parse(JSON.parse(bytes.toString()));
        if (!identity) {
          if (
            value.type !== 'auth' ||
            !verify(value.key, value.signature, authenticationPayload(value.key, nonce)) ||
            (access && !access.scope(value.key))
          ) {
            socket.close(1008);
            return;
          }
          // A simultaneous second session cannot displace a live device route.
          if (clients.has(value.key)) {
            socket.close(1008);
            return;
          }
          identity = value.key;
          clearTimeout(deadline);
          clients.set(identity, socket);
          socket.send(JSON.stringify({ type: 'ready' }));
          return;
        }
        if (value.type === 'auth' || (access && !access.scope(identity))) {
          socket.close(1008);
          return;
        }
        const recipient =
          !access || access.canContact(identity, value.to) ? clients.get(value.to) : undefined;
        if (value.type === 'probe') {
          socket.send(
            JSON.stringify({
              type: 'presence',
              peer: value.to,
              online: recipient?.readyState === WebSocket.OPEN,
            }),
          );
          return;
        }
        const signal = readSignal(value.envelope, value.to);
        if (!signal || signal.from !== identity) {
          socket.close(1008);
          return;
        }
        if (recipient?.readyState === WebSocket.OPEN && recipient.bufferedAmount < 192_000) {
          recipient.send(JSON.stringify({ type: 'signal', envelope: value.envelope }));
        } else socket.send(JSON.stringify({ type: 'unavailable', peer: value.to }));
      } catch {
        socket.close(1008);
      }
    });
    socket.on('error', () => {
      socket.terminate();
    });
    socket.on('close', () => {
      clearTimeout(deadline);
      if (identity && clients.get(identity) === socket) clients.delete(identity);
      identity = null;
    });
  });
  return {
    server,
    deliveryAvailable(from: string, to: string) {
      if (
        !peerKey.safeParse(from).success ||
        !peerKey.safeParse(to).success ||
        (access && (!access.scope(from) || !access.scope(to) || !access.canContact(from, to)))
      )
        return;
      const socket = clients.get(to);
      if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 192000)
        socket.send(JSON.stringify({ type: 'delivery' }));
    },
    liveConnections: () => clients.size,
    async close() {
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      clients.clear();
    },
  };
}
