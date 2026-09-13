import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Field, Page, Section, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { useProfile } from '@/hooks/useRepository';
import { repository } from '@/services';
import { RelationshipAction, useRelationship } from './RelationshipAction';
export function RequestScreen() {
  const { id, needId } = useLocalSearchParams<{ id: string; needId?: string }>();
  const { t } = useTranslation();
  const profile = useProfile(id);
  const state = useRelationship(id, needId);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  // A transport retry retains the same key and exact reviewed payload. Edits start a new attempt.
  const [clientId, setClientId] = useState(() => Crypto.randomUUID());
  const a = useAction();
  const cache = useQueryClient();
  const context = needId ? (state.data?.context ?? '') : reason.trim();
  return (
    <Page title={t('requests.title')} back>
      {sent ? (
        <StateView message={t('requests.sent')} />
      ) : state.isPending || profile.isPending ? (
        <StateView loading />
      ) : state.isError || profile.isError ? (
        <StateView
          error={t('requests.unavailable')}
          onRetry={() => {
            void state.refetch();
            void profile.refetch();
          }}
        />
      ) : state.data.connected || state.data.pendingRequestId || !state.data.canRequest ? (
        <RelationshipAction target={id} matchingRequestId={needId} />
      ) : (
        <>
          <AppText variant="title">
            {t('requests.connectWith', { name: profile.data.displayName })}
          </AppText>
          {needId ? (
            <Section title={t('requests.reason')}>
              <AppText>{context}</AppText>
            </Section>
          ) : (
            <Field
              label={t('requests.reason')}
              value={reason}
              onChangeText={(v) => {
                setReason(v);
                setClientId(Crypto.randomUUID());
              }}
              editable={!a.busy}
              multiline
              maxLength={300}
            />
          )}
          <Field
            label={t('requests.message')}
            placeholder={t('requests.messagePlaceholder')}
            value={message}
            onChangeText={(v) => {
              setMessage(v);
              setClientId(Crypto.randomUUID());
            }}
            editable={!a.busy}
            multiline
            maxLength={1000}
          />
          <AppText tone="secondary">{t('requests.contextNotice')}</AppText>
          {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
          <Button
            variant="connect"
            label={t('requests.send')}
            busy={a.busy}
            disabled={!context}
            onPress={() =>
              void a.run(
                () =>
                  repository().requestConnection(id, context, message, {
                    clientId,
                    ...(needId ? { matchingRequestId: needId } : {}),
                  }),
                () => {
                  setSent(true);
                  void cache.invalidateQueries({ queryKey: ['requests'] });
                  void cache.invalidateQueries({ queryKey: ['relationship'] });
                },
              )
            }
          />
        </>
      )}
    </Page>
  );
}
