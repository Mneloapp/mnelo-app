import { AccessToken, RoomServiceClient, TrackSource } from 'npm:livekit-server-sdk@2.18.0';
export function livekitConfiguration() {
  const local = Deno.env.get('MNELO_SERVER_ENV') === 'local';
  const url = Deno.env.get('LIVEKIT_URL'),
    publicUrl = Deno.env.get('LIVEKIT_PUBLIC_URL');
  const key = Deno.env.get('LIVEKIT_API_KEY'),
    secret = Deno.env.get('LIVEKIT_API_SECRET');
  const deployment = Deno.env.get('LIVEKIT_DEPLOYMENT');
  if (
    !url ||
    !publicUrl ||
    !key ||
    !secret ||
    secret.length < 32 ||
    !['cloud', 'self-hosted-no-auto-create'].includes(deployment ?? '')
  )
    throw new Error('CALL_CONFIGURATION_REQUIRED');
  const internal = new URL(url),
    exposed = new URL(publicUrl);
  for (const item of [internal, exposed])
    if (item.username || item.password || item.search || item.hash || item.pathname !== '/')
      throw new Error('CALL_CONFIGURATION_REQUIRED');
  if (local) {
    if (
      url !== 'http://mnelo-livekit:7880' ||
      publicUrl !== 'ws://127.0.0.1:7880' ||
      deployment !== 'self-hosted-no-auto-create'
    )
      throw new Error('CALL_CONFIGURATION_REQUIRED');
  } else if (
    internal.protocol !== 'https:' ||
    exposed.protocol !== 'wss:' ||
    deployment !== 'cloud' ||
    !internal.hostname.endsWith('.livekit.cloud') ||
    internal.hostname !== exposed.hostname
  )
    throw new Error('CALL_CONFIGURATION_REQUIRED');
  return {
    key,
    secret,
    publicUrl,
    deployment,
    rooms: new RoomServiceClient(url, key, secret, { requestTimeout: 10 }),
  };
}
export const callRoom = (id: string) => 'mnelo-call-' + id;
export async function callToken(
  config: ReturnType<typeof livekitConfiguration>,
  id: string,
  actor: string,
  media: string,
) {
  const token = new AccessToken(config.key, config.secret, { identity: actor, ttl: 60 });
  token.addGrant({
    roomJoin: true,
    room: callRoom(id),
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    canPublishSources:
      media === 'video' ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [TrackSource.MICROPHONE],
  });
  return token.toJwt();
}
export function roomMissing(error: unknown) {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && error.code === 'not_found',
  );
}
export async function closeCallRoom(
  config: ReturnType<typeof livekitConfiguration>,
  id: string,
  people: (string | null)[],
) {
  if (config.deployment === 'cloud') {
    // Cloud revokes tokens even for an identity that already left. Self-hosted uses no-auto-create + room deletion.
    for (const person of people.filter((id): id is string => Boolean(id))) {
      try {
        await config.rooms.removeParticipant(callRoom(id), person);
      } catch (error) {
        if (!roomMissing(error)) throw error;
      }
    }
  }
  try {
    await config.rooms.deleteRoom(callRoom(id));
  } catch (error) {
    if (!roomMissing(error)) throw error;
  }
}
