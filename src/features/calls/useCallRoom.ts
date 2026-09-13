import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import { startCallAudio, stopCallAudio } from './runtime';
import { repository } from '@/services';
export function useCallRoom(id: string, video: boolean) {
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 } },
      }),
  );
  const [state, setState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [failed, setFailed] = useState(false);
  const [, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    let connected = false;
    const refresh = () => {
      if (alive) setRevision((n) => n + 1);
    };
    const change = (value: ConnectionState) => {
      if (!alive) return;
      if (value === ConnectionState.Connected) connected = true;
      if (value === ConnectionState.Disconnected && connected) setFailed(true);
      setState(value);
    };
    const fail = () => {
      if (alive) setFailed(true);
    };
    room.on(RoomEvent.ConnectionStateChanged, change).on(RoomEvent.MediaDevicesError, fail);
    for (const event of [
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
    ])
      room.on(event, refresh);
    void (async () => {
      try {
        const access = await repository().callToken(id);
        if (!alive) return;
        await startCallAudio(video);
        if (!alive) {
          await stopCallAudio();
          return;
        }
        await room.connect(access.url, access.token, { autoSubscribe: true });
        if (!alive) {
          await room.disconnect();
          return;
        }
        await room.startAudio();
        await room.localParticipant.setMicrophoneEnabled(true);
        if (video) await room.localParticipant.setCameraEnabled(true);
        refresh();
      } catch {
        fail();
        await room.disconnect();
        if (alive)
          void repository()
            .respondCall(id, 'failed')
            .catch(() => undefined);
      }
    })();
    const lifecycle = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && video)
        void room.localParticipant.setCameraEnabled(false).then(refresh).catch(fail);
    });
    return () => {
      alive = false;
      lifecycle.remove();
      room.removeAllListeners();
      void room.disconnect().finally(() => stopCallAudio());
    };
  }, [id, video, room]);
  return { room, state, failed };
}
