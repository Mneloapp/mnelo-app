import { formatNumber } from '@/i18n/format';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import type { MatchEvidence } from '@/types/domain';
export function MatchReason({ reason }: { reason: MatchEvidence }) {
  const { t } = useTranslation();
  const language =
    reason.fact === 'en'
      ? t('account.english')
      : reason.fact === 'ka'
        ? t('account.georgian')
        : reason.fact;
  return (
    <AppText tone="secondary">
      {t(`connect.reasons.${reason.signal}`, {
        fact: reason.fact,
        count: reason.count ?? 0,
        number: formatNumber(reason.number),
        language,
      })}
    </AppText>
  );
}
