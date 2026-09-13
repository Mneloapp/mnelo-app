import { useState } from 'react';
import { FlatList } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { IconButton, Page, Row, StateView, ui } from '@/components/ui';
import { PeerAvatar } from '../components/ContactCard';
import { ContactPickerScreen } from './ContactPickerScreen';
import { useDevice } from '../DeviceProvider';
import { useVisibleRead } from '../useVisibleRead';
import { callOutcomeCopy } from '../call-record';
import { CountBadge } from '@/components/CountBadge';
import { CallActions, CurrentCall, type CallTarget } from './CallActions';

export function CallsScreen() {
  const { engine } = useDevice();
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<CallTarget | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['device', 'call-history'],
    queryFn: ({ pageParam }) => engine.callHistory(pageParam),
    initialPageParam: Number.MAX_SAFE_INTEGER,
    getNextPageParam: (page) => (page.length === 40 ? page.at(-1)?.sequence : undefined),
    networkMode: 'always',
  });
  const newest = q.data?.pages[0]?.[0]?.sequence;
  useVisibleRead(engine, null, newest);
  const dates = new Intl.DateTimeFormat(i18n.resolvedLanguage === 'ka' ? 'ka-GE' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <Page
      title={t('tabs.calls')}
      scroll={false}
      bottomSafe={false}
      contentStyle={ui.flex}
      right={
        <IconButton
          icon="plus"
          variant="soft"
          label={t('messenger.newCall')}
          onPress={() => router.push('/new-call')}
        />
      }
    >
      <AppText variant="caption" tone="secondary">
        {t('messenger.callHistoryHint')}
      </AppText>
      <CurrentCall />
      <FlatList
        data={q.data?.pages.flat() ?? []}
        keyExtractor={(item) => item.id}
        initialNumToRender={12}
        windowSize={7}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <Row
            title={item.name}
            subtitle={
              t(item.media === 'video' ? 'messenger.callVideo' : 'messenger.callVoice') +
              ' · ' +
              t(callOutcomeCopy[item.status]) +
              '\n' +
              dates.format(item.endedAt)
            }
            left={<PeerAvatar peer={item.peer} name={item.name} />}
            right={
              item.status === 'missed' && item.unseen ? (
                <CountBadge count={1} label={t('messenger.callMissed')} />
              ) : (
                <AppIcon name={item.media === 'video' ? 'video' : 'phone'} />
              )
            }
            onPress={() => setSelected({ key: item.peer, name: item.name, history: item })}
          />
        )}
        ListEmptyComponent={<StateView loading={q.isPending} message={t('messenger.noCalls')} />}
        ListFooterComponent={
          q.isError ? (
            <StateView
              error={t('messenger.genericError')}
              onRetry={() => void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch())}
            />
          ) : q.isFetchingNextPage ? (
            <StateView loading />
          ) : null
        }
      />
      {selected && <CallActions target={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}
export function NewCallScreen() {
  return <ContactPickerScreen mode="call" />;
}
