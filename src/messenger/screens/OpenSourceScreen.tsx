import { useState } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Page, Section } from '@/components/ui';
import { useLocalAction } from './shared';
import licenseText from '@/lib/open-source-license.json';

const source = 'https://github.com/Mneloapp/mnelo-app';
// Retain this exact public source tag for the distributed binary.
const sourceRef = 'ios-0.1.0-33';

export function OpenSourceScreen() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const action = useLocalAction();
  return (
    <Page title={t('messenger.openSource')} back>
      <AppText>{t('messenger.sourceProduct')}</AppText>
      <AppText>{t('messenger.sourceCopyright')}</AppText>
      <AppText tone="secondary">{t('messenger.sourceNotice')}</AppText>
      <Button
        label={t('messenger.viewSource')}
        busy={action.busy}
        onPress={() => void action.run(() => Linking.openURL(source + '/tree/' + sourceRef))}
      />
      <Button
        label={t('messenger.thirdPartyNotices')}
        variant="secondary"
        onPress={() =>
          void action.run(() =>
            Linking.openURL(source + '/blob/' + sourceRef + '/docs/licenses/README.md'),
          )
        }
      />
      <Button
        label={t(expanded ? 'messenger.hideLicense' : 'messenger.showLicense')}
        variant="secondary"
        onPress={() => setExpanded((value) => !value)}
      />
      {expanded && (
        <Section title={t('messenger.sourceLicenseHeading')}>
          <AppText selectable>{licenseText.license}</AppText>
        </Section>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
