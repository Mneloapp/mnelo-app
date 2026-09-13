import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Page, Button, ui } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { PeerAvatar } from './ContactCard';
import { MAX_CALL_PARTICIPANTS } from '../group-call';
export function GroupCallSetup({
  title,
  members,
  media,
  busy,
  error,
  onStart,
}: {
  title: string;
  members: { key: string; name: string }[];
  media: 'voice' | 'video';
  busy: boolean;
  error: string | null;
  onStart: (peers: string[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() =>
    members.length < MAX_CALL_PARTICIPANTS ? members.map((member) => member.key) : [],
  );
  return (
    <Page title={title} back scroll={false} contentStyle={ui.flex}>
      <AppText variant="headline">
        {t(media === 'video' ? 'groupCall.video' : 'groupCall.voice')}
      </AppText>
      <AppText tone="secondary">
        {t('groupCall.choose', { count: MAX_CALL_PARTICIPANTS - 1 })}
      </AppText>
      <FlatList
        data={members}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const checked = selected.includes(item.key);
          return (
            <FocusPressable
              accessibilityRole="checkbox"
              accessibilityLabel={item.name}
              accessibilityState={{
                checked,
                disabled: busy || (!checked && selected.length >= MAX_CALL_PARTICIPANTS - 1),
              }}
              disabled={busy || (!checked && selected.length >= MAX_CALL_PARTICIPANTS - 1)}
              onPress={() =>
                setSelected((values) =>
                  checked ? values.filter((key) => key !== item.key) : [...values, item.key],
                )
              }
              style={[ui.row, { paddingVertical: 12 }]}
            >
              <PeerAvatar peer={item.key} name={item.name} />
              <AppText style={ui.flex}>{item.name}</AppText>
              <AppIcon name={checked ? 'check-circle' : 'circle'} />
            </FocusPressable>
          );
        }}
      />
      {error && <AppText accessibilityRole="alert">{error}</AppText>}
      <View>
        <Button
          label={t(media === 'video' ? 'groupCall.video' : 'groupCall.voice')}
          disabled={busy || !selected.length}
          busy={busy}
          onPress={() => onStart(selected)}
        />
      </View>
    </Page>
  );
}
