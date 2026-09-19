import { useState } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Page } from '@/components/ui';
import { SettingsAction, SettingsCard, settingsStyles } from '../components/SettingsUI';
import { useLocalAction } from './shared';
import licenseText from '@/lib/open-source-license.json';

const source = 'https://github.com/Mneloapp/mnelo-app';
// Retain this exact public source tag for the distributed binary.
const sourceRef = 'ios-0.1.0-44';

export function OpenSourceScreen() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const action = useLocalAction();
  return (
    <Page title={t('messenger.openSource')} back contentStyle={settingsStyles.page}>
      <SettingsCard title={t('messenger.openSource')} icon="code">
        <AppText>{t('messenger.sourceProduct')}</AppText>
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.sourceCopyright')}
        </AppText>
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.sourceNotice')}
        </AppText>
      </SettingsCard>
      <SettingsAction
        icon="github"
        label={t('messenger.viewSource')}
        busy={action.busy}
        onPress={() => void action.run(() => Linking.openURL(source + '/tree/' + sourceRef))}
      />
      <SettingsAction
        icon="file-text"
        label={t('messenger.thirdPartyNotices')}
        variant="secondary"
        onPress={() =>
          void action.run(() =>
            Linking.openURL(source + '/blob/' + sourceRef + '/docs/licenses/README.md'),
          )
        }
      />
      <SettingsAction
        icon={expanded ? 'chevron-up' : 'chevron-down'}
        label={t(expanded ? 'messenger.hideLicense' : 'messenger.showLicense')}
        variant="secondary"
        onPress={() => setExpanded((value) => !value)}
      />
      {expanded && (
        <SettingsCard title={t('messenger.sourceLicenseHeading')} icon="file-text">
          <AppText selectable variant="caption" style={settingsStyles.note}>
            {licenseText.license}
          </AppText>
        </SettingsCard>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
