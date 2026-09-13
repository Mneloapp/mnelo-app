import { useState } from 'react';
import { Image, View, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/components/AppText';
import { Button, ui } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
import { theme } from '@/theme/tokens';
export function AvatarEditor() {
  const { t } = useTranslation();
  const [candidate, setCandidate] = useState<string | null>(null);
  const a = useAction();
  const cache = useQueryClient();
  async function pick() {
    const selected = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      exif: false,
    });
    if (selected.canceled || !selected.assets[0]) return;
    const asset = selected.assets[0];
    const context = ImageManipulator.manipulate(asset.uri);
    context.resize(
      asset.width >= asset.height
        ? { width: Math.min(512, asset.width) }
        : { height: Math.min(512, asset.height) },
    );
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    setCandidate(result.uri);
  }
  return (
    <View style={ui.stack}>
      {candidate && (
        <Image
          source={{ uri: candidate }}
          accessibilityLabel={t('profile.photoPreview')}
          style={{
            width: theme.avatar.large,
            height: theme.avatar.large,
            borderRadius: theme.radii.pill,
            alignSelf: 'center',
          }}
        />
      )}
      <Button
        variant="secondary"
        label={t('profile.changePhoto')}
        busy={a.busy}
        onPress={() => void a.run(pick)}
      />
      {candidate && (
        <>
          <Button
            label={t('profile.savePhoto')}
            busy={a.busy}
            onPress={() =>
              void a.run(
                async () => {
                  const bytes =
                    Platform.OS === 'web'
                      ? await (await fetch(candidate)).arrayBuffer()
                      : await new File(candidate).arrayBuffer();
                  return repository().uploadAvatar(bytes);
                },
                (profile) => {
                  useSession.getState().setProfile(profile);
                  setCandidate(null);
                  void cache.invalidateQueries({ queryKey: ['profile'] });
                  void cache.invalidateQueries({ queryKey: ['avatar'] });
                },
              )
            }
          />
          <Button
            variant="secondary"
            label={t('common.cancel')}
            onPress={() => setCandidate(null)}
          />
        </>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </View>
  );
}
