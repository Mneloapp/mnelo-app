import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Choice, Page, Row, Section, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
import type { PrivacySettings } from '@/types/domain';
export function PrivacyScreen() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['privacy'], queryFn: () => repository().privacy() });
  const [draftSettings, setSettings] = useState<PrivacySettings>();
  const settings = draftSettings ?? q.data;
  const a = useAction();
  const cache = useQueryClient();
  return (
    <Page title={t('me.privacy')} back>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        settings && (
          <>
            <Row title={t('moderation.blockedPeople')} onPress={() => router.push('/blocked')} />
            <AppText tone="secondary">{t('privacy.audienceNotice')}</AppText>
            <Section title={t('privacy.discoverability')}>
              <Choice
                value={settings.discoverability}
                onChange={(discoverability) => setSettings({ ...settings, discoverability })}
                options={[
                  { value: 'relevant', label: t('privacy.relevant') },
                  { value: 'everyone', label: t('privacy.everyone') },
                  { value: 'nobody', label: t('privacy.nobody') },
                ]}
              />
            </Section>
            <Section title={t('privacy.phone')}>
              <AppText tone="secondary">{t('privacy.phoneNotice')}</AppText>
              <Choice
                value={settings.phoneVisibility}
                onChange={(phoneVisibility) => setSettings({ ...settings, phoneVisibility })}
                options={[
                  { value: 'nobody', label: t('privacy.nobody') },
                  { value: 'connections', label: t('me.connections') },
                ]}
              />
            </Section>
            <Section title={t('privacy.location')}>
              <AppText>{t('privacy.never')}</AppText>
              <AppText variant="caption" tone="secondary">
                {t('privacy.locationExplanation')}
              </AppText>
            </Section>
            <Section title={t('privacy.requests')}>
              <Choice
                value={settings.requestAudience}
                onChange={(requestAudience) => setSettings({ ...settings, requestAudience })}
                options={[
                  { value: 'relevant', label: t('privacy.relevant') },
                  { value: 'mutual', label: t('privacy.mutual') },
                  { value: 'everyone', label: t('privacy.everyone') },
                ]}
              />
            </Section>
            {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
            <Button
              label={t('common.save')}
              busy={a.busy}
              onPress={() =>
                void a.run(
                  async () => {
                    await repository().updatePrivacy(settings);
                    for (const key of ['privacy', 'matches', 'profile', 'people', 'relationship'])
                      await cache.invalidateQueries({ queryKey: [key] });
                  },
                  () => {
                    void q.refetch();
                    router.back();
                  },
                )
              }
            />
          </>
        )
      )}
    </Page>
  );
}
