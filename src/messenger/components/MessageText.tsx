import { Linking, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import type { MessageLink } from '../message-links';
import { useLocalAction } from '../screens/shared';

export function MessageText({
  body,
  links,
  enabled = true,
  onLongPress,
}: {
  body: string;
  links: readonly MessageLink[];
  enabled?: boolean;
  onLongPress?: () => void;
}) {
  const action = useLocalAction();
  const pieces = links.flatMap((link, index) => {
    const before = body.slice(index ? links[index - 1]!.end : 0, link.start);
    return [
      before,
      <AppText
        key={link.start}
        accessibilityRole="link"
        accessibilityLabel={link.text}
        accessibilityState={{ disabled: !enabled }}
        style={styles.link}
        onPress={enabled ? () => void action.run(() => Linking.openURL(link.url)) : undefined}
        onLongPress={enabled ? onLongPress : undefined}
        suppressHighlighting={!enabled}
      >
        {link.text}
      </AppText>,
    ];
  });
  return (
    <View>
      <AppText>
        {pieces}
        {body.slice(links.at(-1)?.end ?? 0)}
      </AppText>
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { color: theme.colors.accentText, textDecorationLine: 'underline' },
});
