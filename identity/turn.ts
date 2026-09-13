import { createHmac } from 'node:crypto';
import { peerKey } from '../src/messenger/model';
import { iceConfiguration, type IceConfiguration } from '../src/messenger/ice-protocol';

export type TurnIssuer = { issue(key: string): IceConfiguration };
export function turnIssuer(secret: string, host: string, now = Date.now): TurnIssuer {
  if (!/^[a-f0-9]{64}$/.test(secret) || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(host))
    throw new Error('TURN_CONFIGURATION_INVALID');
  return {
    issue(key) {
      peerKey.parse(key);
      const expires = Math.floor(now() / 1000) + 3600;
      // Standard coturn REST authentication. Never expose the key or phone number
      // as the TURN username; the shared secret stays on these two server services.
      const pseudonym = createHmac('sha256', secret)
        .update('mnelo-turn-v1:' + key)
        .digest('hex')
        .slice(0, 32);
      const username = `${expires}:${pseudonym}`;
      const credential = createHmac('sha1', secret).update(username).digest('base64');
      return iceConfiguration.parse({
        expires: expires * 1000,
        iceServers: [
          {
            urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`],
            username,
            credential,
          },
        ],
      });
    },
  };
}
