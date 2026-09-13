import { BlockControl } from './BlockControl';
import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Choice, Field, Page, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
import type { ReportReason } from '@/types/domain';
export function ReportScreen() {
  const { id, messageId } = useLocalSearchParams<{ id: string; messageId?: string }>();
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);
  const a = useAction();
  const [clientId, setClientId] = useState(() => Crypto.randomUUID());
  return (
    <Page title={t('moderation.report')} back>
      {sent ? (
        <>
          <StateView message={t('moderation.received')} />
          <BlockControl target={id} disabled={a.busy} />
        </>
      ) : (
        <>
          <AppText tone="secondary">{t('moderation.private')}</AppText>
          <Choice
            layout="vertical"
            value={reason}
            onChange={(value) => {
              if (!a.busy) {
                setReason(value);
                setClientId(Crypto.randomUUID());
              }
            }}
            options={(
              ['spam', 'fraud', 'harassment', 'impersonation', 'unsafe', 'other'] as const
            ).map((value) => ({ value, label: t(`moderation.reasons.${value}`) }))}
          />
          <Field
            label={t('moderation.detail')}
            value={detail}
            onChangeText={(value) => {
              setDetail(value);
              setClientId(Crypto.randomUUID());
            }}
            editable={!a.busy}
            multiline
            maxLength={2000}
          />
          {messageId && <AppText tone="secondary">{t('moderation.messageIncluded')}</AppText>}
          {reason === 'other' && <AppText tone="secondary">{t('moderation.otherHint')}</AppText>}
          {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
          <Button
            label={t('common.send')}
            busy={a.busy}
            disabled={reason === 'other' && detail.trim().length < 5}
            onPress={() =>
              void a.run(
                () =>
                  repository().report(id, reason, detail, {
                    clientId,
                    ...(messageId ? { messageId } : {}),
                  }),
                () => setSent(true),
              )
            }
          />
          <BlockControl target={id} disabled={a.busy} />
        </>
      )}
    </Page>
  );
}
