import { intentTerm, intentArea } from '@/i18n/intent-labels';
import { formatCalendarDate } from '@/i18n/format';
import { BlockControl } from '@/features/moderation/BlockControl';
import { ContactDetails } from '@/features/privacy/ContactDetails';
import { ProfileReputation } from '@/features/reputation/Reviews';
import { RelationshipAction } from '@/features/connections/RelationshipAction';
import { MatchReason } from './MatchReason';
import { theme } from '@/theme/tokens';
import { ProfileAvatar } from '@/features/profiles/ProfileAvatar';
import { useState } from 'react';
import { View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Choice, Field, Page, Row, Section, StateView, ui } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
import type { NeedMode, Interpretation } from '@/types/domain';
export function ConnectScreen() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<NeedMode>('need');
  const a = useAction();
  return (
    <Page bottomSafe={false}>
      <View style={[ui.hero, { gap: theme.spacing.xl, paddingVertical: theme.spacing.section }]}>
        <AppText variant="display" accessibilityRole="header">
          {t('connect.title')}
        </AppText>
        <Field
          label={t('connect.inputLabel')}
          hideLabel
          placeholder={t('connect.placeholder')}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          style={{ minHeight: theme.controls.requestHeight }}
        />
        <Choice
          value={mode}
          onChange={setMode}
          options={[
            { value: 'need', label: t('connect.need') },
            { value: 'offer', label: t('connect.offer') },
          ]}
        />
        {a.error && (
          <AppText accessibilityRole="alert" style={ui.dangerText}>
            {a.error}
          </AppText>
        )}
        <Button
          variant="connect"
          label={t('connect.action')}
          busy={a.busy}
          disabled={!text.trim()}
          onPress={() =>
            void a.run(
              () => repository().interpret(text, mode),
              (interpretation) => {
                useSession.getState().setDraft({ mode, interpretation });
                router.push('/interpretation');
              },
            )
          }
        />
        <AppText variant="caption" tone="secondary">
          {t('connect.example')}
        </AppText>
      </View>
    </Page>
  );
}
export function InterpretationScreen() {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const draft = useSession((s) => s.draft);
  const [answer, setAnswer] = useState('');
  const [interpretation, setInterpretation] = useState<Interpretation | null>(
    draft?.interpretation ?? null,
  );
  const a = useAction();
  if (!interpretation || !draft)
    return (
      <Page title={t('tabs.connect')} back>
        <StateView message={t('connect.startAgain')} />
      </Page>
    );
  const clarification = interpretation.clarification;
  return (
    <Page title={t('connect.interpretation')} back>
      <AppText tone="secondary">{draft.interpretation.rawText}</AppText>
      {clarification ? (
        <>
          <AppText variant="title">
            {t(clarification === 'area' ? 'connect.clarifyArea' : 'connect.clarifyCapability')}
          </AppText>
          <Field
            label={t('connect.answer')}
            value={answer}
            onChangeText={setAnswer}
            maxLength={clarification === 'area' ? 120 : 240}
          />
          {clarification === 'area' && (
            <AppText tone="secondary">{t('connect.coarseAreaOnly')}</AppText>
          )}
          {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
          <Button
            label={t('common.continue')}
            disabled={!answer.trim()}
            busy={a.busy}
            onPress={() =>
              void a.run(
                () => repository().clarify(draft.mode, interpretation, answer),
                (value) => {
                  setInterpretation(value);
                  setAnswer('');
                },
              )
            }
          />
        </>
      ) : (
        <>
          <Section title={t('connect.summary')}>
            {[
              intentTerm(interpretation.capability),
              intentArea(interpretation.area),
              formatCalendarDate(interpretation.neededOn),
              interpretation.details.trim() !== interpretation.rawText.trim()
                ? interpretation.details
                : '',
            ]
              .filter(Boolean)
              .map((v, i) => (
                <Row key={i} title={v} />
              ))}
          </Section>
          <AppText tone="secondary">{t('connect.publishNotice')}</AppText>
          <Button
            variant="secondary"
            label={t('connect.editRequest')}
            onPress={() => router.back()}
          />
          {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
          <Button
            variant="connect"
            label={t('connect.findPeople')}
            busy={a.busy}
            onPress={() =>
              void a.run(
                () => repository().saveNeed(draft.mode, interpretation),
                (need) => {
                  void cache.invalidateQueries({ queryKey: ['needs'] });
                  router.replace({ pathname: '/results/[id]', params: { id: need.id } });
                  useSession.getState().setDraft(null);
                },
              )
            }
          />
        </>
      )}
    </Page>
  );
}
export function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const focused = useIsFocused();
  const need = useQuery({
    queryKey: ['need', id],
    queryFn: () => repository().need(id),
    refetchOnMount: 'always',
  });
  const q = useQuery({
    queryKey: ['matches', id],
    queryFn: () => repository().matches(id),
    enabled: need.data?.status === 'active',
    refetchOnMount: 'always',
    refetchInterval: focused ? 60000 : false,
  });
  const action = useAction();
  const cache = useQueryClient();
  return (
    <Page title={t('connect.results')} back>
      {need.isPending ? (
        <StateView loading />
      ) : need.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void need.refetch()} />
      ) : need.data?.status !== 'active' ? (
        <>
          <AppText>{t(`connect.status.${need.data?.status ?? 'closed'}`)}</AppText>
          <Button
            label={t('connect.activate')}
            busy={action.busy}
            onPress={() =>
              void action.run(async () => {
                await repository().setNeedStatus(id, 'active');
                await cache.invalidateQueries({ queryKey: ['needs'] });
                await need.refetch();
              })
            }
          />
          {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
        </>
      ) : q.isPending || q.isFetching ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <AppText variant="title">
            {t('connect.peopleCount', { count: q.data?.length ?? 0 })}
          </AppText>
          {q.data?.length ? (
            q.data.map((match) => (
              <Section key={match.profile.id} title={t(`connect.rank.${match.rank}`)}>
                <Row
                  title={match.profile.displayName}
                  subtitle={'@' + match.profile.username}
                  left={<ProfileAvatar profile={match.profile} />}
                  onPress={() =>
                    router.push({
                      pathname: '/profile/[id]',
                      params: { id: match.profile.id, needId: id },
                    })
                  }
                />
                {match.reasons.map((reason) => (
                  <MatchReason key={reason.signal + reason.fact} reason={reason} />
                ))}
                <View style={ui.horizontal}>
                  <View style={ui.flex}>
                    <Button
                      variant="secondary"
                      label={t('common.view')}
                      onPress={() =>
                        router.push({
                          pathname: '/profile/[id]',
                          params: { id: match.profile.id, needId: id },
                        })
                      }
                    />
                  </View>
                  <View style={ui.flex}>
                    <Button
                      variant="connect"
                      label={t('tabs.connect')}
                      onPress={() =>
                        router.push({
                          pathname: '/request/[id]',
                          params: { id: match.profile.id, needId: id },
                        })
                      }
                    />
                  </View>
                </View>
              </Section>
            ))
          ) : (
            <StateView message={t('connect.noMatches')} />
          )}
        </>
      )}
    </Page>
  );
}
export function MatchProfileScreen() {
  const { id, needId } = useLocalSearchParams<{ id: string; needId?: string }>();
  const { t } = useTranslation();
  const matches = useQuery({
    queryKey: ['matches', needId],
    queryFn: () => repository().matches(needId!),
    enabled: Boolean(needId),
    refetchOnMount: 'always',
  });
  const selectedMatch = matches.data?.find((m) => m.profile.id === id);
  const reasons = selectedMatch?.reasons;
  const q = useQuery({
    queryKey: ['profile', id],
    queryFn: () => repository().profile(id),
    enabled: !needId || Boolean(selectedMatch),
    refetchOnMount: 'always',
  });
  const intents = useQuery({
    queryKey: ['profile-intents', id],
    queryFn: () => repository().profileIntents(id),
    enabled: Boolean(q.data) && !q.isError,
  });
  const self = useSession((s) => s.session?.userId);
  return (
    <Page title={t('profile.title')} back>
      {needId && matches.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void matches.refetch()} />
      ) : needId && !matches.isPending && !selectedMatch ? (
        <StateView message={t('connect.matchChanged')} />
      ) : q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        q.data && (
          <>
            <View style={[ui.center, ui.stack]}>
              <ProfileAvatar profile={q.data} size="large" />
              <AppText variant="title" centered>
                {q.data.displayName}
              </AppText>
              <AppText tone="secondary">{'@' + q.data.username}</AppText>
              {q.data.area && <AppText tone="secondary">{q.data.area}</AppText>}
            </View>
            {reasons && (
              <Section title={t('connect.why')}>
                {reasons.map((reason) => (
                  <MatchReason key={reason.signal + reason.fact} reason={reason} />
                ))}
              </Section>
            )}
            {q.data.bio && <AppText>{q.data.bio}</AppText>}
            <Section title={t('profile.capabilities')}>
              {q.data.capabilities.length ? (
                q.data.capabilities.map((c) => <Row key={c} title={c} />)
              ) : (
                <AppText tone="secondary">{t('profile.noCapabilities')}</AppText>
              )}
            </Section>
            {intents.data && intents.data.length > 0 && (
              <Section title={t('me.needs')}>
                {intents.data.map((intent) => (
                  <Row
                    key={intent.id}
                    title={
                      t(intent.mode === 'need' ? 'connect.need' : 'connect.offer') +
                      ': ' +
                      intent.capability
                    }
                    subtitle={[intent.area, intent.neededOn].filter(Boolean).join(' · ')}
                  />
                ))}
              </Section>
            )}
            <ProfileReputation profile={q.data} />
            {id !== self && (
              <>
                <RelationshipAction target={id} matchingRequestId={needId} />
                <ContactDetails key={id} target={id} />
                <Button
                  variant="secondary"
                  label={t('moderation.report')}
                  onPress={() => router.push({ pathname: '/report/[id]', params: { id } })}
                />
                <BlockControl target={id} />
              </>
            )}
          </>
        )
      )}
    </Page>
  );
}
export { RequestScreen } from '@/features/connections/RequestScreen';
