import * as Crypto from 'expo-crypto';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { requestCallMedia } from './runtime';
import { repository } from '@/services';
import { IconButton } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
export function StartCall({
  conversation,
  video,
  onError,
}: {
  conversation: string;
  video: boolean;
  onError: (message: string | undefined) => void;
}) {
  const { t } = useTranslation(),
    action = useAction();
  useEffect(() => {
    if (action.error) onError(action.error);
  }, [action.error, onError]);
  const key = useRef<string | null>(null);
  return (
    <View>
      <IconButton
        label={t(video ? 'calls.video' : 'calls.voice')}
        icon={video ? 'video' : 'phone'}
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            onError(undefined);
            await requestCallMedia(video);
            key.current ??= Crypto.randomUUID();
            const id = await repository().startCall(
              conversation,
              video ? 'video' : 'voice',
              key.current,
            );
            key.current = null;
            router.push({ pathname: '/call/[id]', params: { id } });
          })
        }
      />
    </View>
  );
}
