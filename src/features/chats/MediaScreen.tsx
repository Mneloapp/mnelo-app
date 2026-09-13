import { useEffect, useState } from 'react';
import { Image, View, Platform, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { chooseDeviceContactName } from './device-contact';
import { AppText } from '@/components/AppText';
import { Button, Field, Page, Row, StateView, ui } from '@/components/ui';
import { repository } from '@/services';
import { RepositoryError } from '@/services/repository';
import { useAction } from '@/hooks/useAction';
import {
  imageSelection,
  fileSelection,
  mediaBytes,
  discardCachedMedia,
  type SelectedMedia,
} from './media-files';
import { VoiceRecorder } from './VoiceRecorder';
import { theme } from '@/theme/tokens';
export function MediaScreen() {
  const { kind, conversationId } = useLocalSearchParams<{
    kind: string;
    conversationId?: string;
  }>();
  const { t } = useTranslation();
  const a = useAction();
  const cache = useQueryClient();
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState<SelectedMedia | null>(null);
  const selectedUri = selected?.uri;
  useEffect(
    () => () => {
      if (selectedUri) discardCachedMedia(selectedUri);
    },
    [selectedUri],
  );
  const [clientId, setClientId] = useState(() => Crypto.randomUUID());
  const [attachmentId, setAttachmentId] = useState<string>();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deviceContact, setDeviceContact] = useState<string>();
  const people = useQuery({
    queryKey: ['media-contacts', search],
    queryFn: () => repository().searchProfiles(search),
    enabled: kind === 'contact' && search.length >= 2,
  });
  function choose(file: SelectedMedia | null) {
    setSelected(file);
    setAttachmentId(undefined);
    setClientId(Crypto.randomUUID());
  }
  async function send() {
    if (!conversationId) throw new RepositoryError('INVALID');
    if (kind === 'location' && location)
      await repository().sendLocation({ conversationId, clientId, ...location, label: caption });
    else if (kind === 'contact' && contact)
      await repository().sendContact(conversationId, contact, clientId);
    else if (selected) {
      const attachment =
        attachmentId ??
        (await repository().uploadAttachment({
          conversationId,
          clientId,
          name: selected.name,
          mime: selected.mime,
          bytes: await mediaBytes(selected.uri),
        }));
      setAttachmentId(attachment);
      await repository().sendAttachment(attachment, caption, clientId);
      discardCachedMedia(selected.uri);
    } else throw new RepositoryError('INVALID');
    await cache.invalidateQueries({ queryKey: ['messages', conversationId] });
    await cache.invalidateQueries({ queryKey: ['conversations'] });
    router.back();
  }
  return (
    <Page
      title={t(
        kind === 'voice'
          ? 'chat.voiceMessage'
          : kind === 'location'
            ? 'chat.location'
            : kind === 'contact' || kind === 'contacts'
              ? 'chat.contact'
              : kind === 'file'
                ? 'chat.file'
                : 'chat.photo',
      )}
      back
    >
      {kind !== 'contacts' && <AppText tone="secondary">{t('media.private')}</AppText>}
      {kind === 'voice' ? (
        <VoiceRecorder onReady={choose} disabled={a.busy} />
      ) : kind === 'location' ? (
        <>
          <AppText>{t('media.locationConsent')}</AppText>
          <Button
            variant="secondary"
            label={t('media.shareLocation')}
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                const permission = await Location.requestForegroundPermissionsAsync();
                if (!permission.granted) throw new RepositoryError('LOCATION_PERMISSION_REQUIRED');
                const result = await Location.getCurrentPositionAsync({
                  // A deliberate one-point share must also work without a network location fix.
                  // OS approximate-location consent still limits the returned precision.
                  accuracy: Location.Accuracy.High,
                });
                setLocation({
                  latitude: result.coords.latitude,
                  longitude: result.coords.longitude,
                });
              })
            }
          />
          {location && <AppText>{t('media.locationReady')}</AppText>}
        </>
      ) : kind === 'contact' ? (
        <>
          <Field
            label={t('chats.searchPeople')}
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setContact(null);
            }}
            autoCapitalize="none"
            editable={!a.busy}
          />
          {search.length >= 2 && people.isPending ? (
            <StateView loading />
          ) : people.isError ? (
            <StateView error={t('common.loadError')} onRetry={() => void people.refetch()} />
          ) : search.length >= 2 && people.data?.length === 0 ? (
            <StateView message={t('chats.noPeopleFound')} />
          ) : (
            people.data?.map((p) => (
              <Row
                key={p.id}
                title={p.displayName}
                selected={contact === p.id}
                disabled={a.busy}
                subtitle={'@' + p.username}
                right={
                  <AppText>{contact === p.id ? t('common.selected') : t('common.select')}</AppText>
                }
                onPress={() => setContact(p.id)}
              />
            ))
          )}
          <AppText variant="caption" tone="secondary">
            {t('media.contactPrivacy')}
          </AppText>
        </>
      ) : kind === 'contacts' ? (
        <>
          <AppText>{t('chats.contactsOptIn')}</AppText>
          <Button
            variant="secondary"
            label={t('chats.chooseContacts')}
            busy={a.busy}
            onPress={() =>
              void a.run(async () => {
                if (Platform.OS === 'web') throw new RepositoryError('UNAVAILABLE');
                const name = await chooseDeviceContactName();
                if (name !== null) setDeviceContact(name);
              })
            }
          />
          {deviceContact && <Row title={deviceContact} />}
          <Button
            label={t('chats.invite')}
            onPress={() => void Share.share({ message: t('chats.invitation') })}
          />
        </>
      ) : (
        <>
          <Button
            variant="secondary"
            label={t('media.choose')}
            disabled={a.busy}
            onPress={() =>
              void a.run(async () =>
                choose(kind === 'file' ? await fileSelection() : await imageSelection()),
              )
            }
          />
          {kind !== 'file' && (
            <Button
              variant="secondary"
              label={t('media.camera')}
              disabled={a.busy}
              onPress={() => void a.run(async () => choose(await imageSelection(true)))}
            />
          )}
        </>
      )}
      {selected && (
        <View style={ui.stack}>
          {selected.mime === 'image/jpeg' && (
            <Image
              source={{ uri: selected.uri }}
              accessible
              accessibilityLabel={t('media.preview')}
              style={{
                width: '100%',
                height: theme.controls.textareaHeight * 2,
                borderRadius: theme.radii.md,
              }}
              resizeMode="contain"
            />
          )}
          <AppText>{selected.name}</AppText>
          {kind !== 'voice' && (
            <Button
              variant="secondary"
              label={t('common.cancel')}
              disabled={a.busy}
              onPress={() => {
                discardCachedMedia(selected.uri);
                choose(null);
              }}
            />
          )}
        </View>
      )}
      {kind !== 'contacts' && kind !== 'contact' && (
        <Field
          label={t('media.caption')}
          value={caption}
          onChangeText={setCaption}
          maxLength={kind === 'location' ? 240 : 1000}
          editable={!a.busy}
        />
      )}
      {a.error && (
        <AppText accessibilityRole="alert" style={ui.dangerText}>
          {a.error}
        </AppText>
      )}
      {kind !== 'contacts' && (
        <Button
          label={t('common.send')}
          busy={a.busy}
          disabled={!selected && !location && !contact}
          onPress={() => void a.run(send)}
        />
      )}
    </Page>
  );
}
