import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ScreenAppearance } from '@/theme/appearance';
import { CallAction } from './CallAction';
import { useEffect, useRef, useState } from 'react';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CallControls } from './CallControls';
import { requestCallMedia } from './runtime';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
import { AppText } from '@/components/AppText';
import { Avatar, Button, Page, StateView, ui } from '@/components/ui';
import type { CallDetails } from '@/types/domain';
import { useAction } from '@/hooks/useAction';
import { theme } from '@/theme/tokens';
export function CallScreen() {
  return (
    <ScreenAppearance value="call">
      <CallContent />
    </ScreenAppearance>
  );
}
function CallContent() {
  const focused = useIsFocused();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const action = useAction();
  const user = useSession((s) => s.session?.userId);
  const [now, setNow] = useState(() => Date.now());
  const q = useQuery({
    queryKey: ['call', id],
    queryFn: () => repository().call(id),
    refetchInterval: 5000,
  });
  const { refetch } = q;
  useEffect(() => {
    if (!user) return;
    return repository().subscribeCalls(user, () => void refetch());
  }, [user, id, refetch]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const lastCall = useRef<CallDetails | undefined>(undefined);
  useEffect(() => {
    lastCall.current = q.data;
  }, [q.data]);
  useEffect(
    () => () => {
      const previous = lastCall.current;
      if (previous && ['ringing', 'accepted'].includes(previous.status)) {
        const response = previous.incoming && previous.status === 'ringing' ? 'decline' : 'end';
        void repository()
          .respondCall(id, response)
          .catch(() => undefined);
      }
    },
    [id],
  );
  const call = q.data,
    ringing = call?.status === 'ringing',
    expired = Boolean(ringing && call && Date.parse(call.expiresAt) <= now);
  const terminal = Boolean(call && !['ringing', 'accepted'].includes(call.status)) || expired;
  return (
    <Page
      title={t(call?.media === 'video' ? 'calls.video' : 'calls.voice')}
      contentStyle={styles.content}
    >
      {focused && <StatusBar style="light" />}
      {q.isPending ? (
        <StateView loading />
      ) : q.isError || !call ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={ui.center}>
            <Avatar name={call.peerName} size="large" />
          </View>
          <AppText variant="title" centered>
            {call.peerName}
          </AppText>
          {terminal ? (
            <AppText centered>{t(expired ? 'calls.missed' : `calls.${call.status}`)}</AppText>
          ) : ringing ? (
            <>
              <AppText centered accessibilityLiveRegion="polite">
                {t(call.incoming ? 'calls.incoming' : 'calls.ringing')}
              </AppText>
              {call.incoming && (
                <>
                  <Button
                    variant="accent"
                    label={t('calls.accept')}
                    busy={action.busy}
                    onPress={() =>
                      void action.run(async () => {
                        await requestCallMedia(call.media === 'video');
                        await repository().respondCall(id, 'accept');
                        await q.refetch();
                      })
                    }
                  />
                  <Button
                    label={t('calls.decline')}
                    variant="secondary"
                    disabled={action.busy}
                    onPress={() =>
                      void action.run(async () => {
                        await repository().respondCall(id, 'decline');
                        await q.refetch();
                      })
                    }
                  />
                </>
              )}
            </>
          ) : call.canJoin ? (
            <CallControls id={id} video={call.media === 'video'} />
          ) : (
            <AppText>{t('calls.otherDevice')}</AppText>
          )}
          {!terminal && (!call.incoming || call.canJoin) && (
            <CallAction
              icon="phone-off"
              danger
              label={t('calls.end')}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  await repository().respondCall(id, 'end');
                  await q.refetch();
                })
              }
            />
          )}
        </>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      {(terminal || q.isError) && (
        <Button
          label={t('calls.returnToChat')}
          onPress={() =>
            call
              ? router.dismissTo({ pathname: '/chat/[id]', params: { id: call.conversationId } })
              : router.back()
          }
        />
      )}
    </Page>
  );
}
const styles = StyleSheet.create({
  content: { justifyContent: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.xl },
});
