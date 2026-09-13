import { iceConfiguration, type IceConfiguration } from './ice-protocol';
import type { PhoneClient } from './phone-client';

export function deviceIceConfiguration(client: Pick<PhoneClient, 'execute'>, now = Date.now) {
  let cached: IceConfiguration | null = null;
  let pending: Promise<IceConfiguration> | null = null;
  return async (): Promise<RTCConfiguration> => {
    if (!cached || cached.expires - now() < 300_000) {
      if (!pending)
        pending = client
          .execute({ action: 'ice' })
          .then((response) => {
            const value = iceConfiguration.parse(response.ice);
            const remaining = value.expires - now();
            if (remaining < 300_000 || remaining > 3_660_000)
              throw new Error('TURN_CREDENTIAL_INVALID');
            cached = value;
            return value;
          })
          .finally(() => {
            pending = null;
          });
      await pending;
    }
    if (!cached || cached.expires - now() < 300_000) throw new Error('TURN_CREDENTIAL_EXPIRED');
    return {
      iceServers: cached.iceServers,
      iceTransportPolicy: 'relay',
      bundlePolicy: 'max-bundle',
    };
  };
}
