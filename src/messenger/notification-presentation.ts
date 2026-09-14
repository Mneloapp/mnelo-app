import type { DeviceMessenger } from './engine';
import { availableNotificationPreview, notificationText } from './notification-preview';
import { savedPhoneName } from './phonebook';

export async function localNotificationPreview(
  engine: DeviceMessenger,
  id: string,
  language: string,
) {
  const own = engine.currentIdentity();
  if (!own) return null;
  const preview = await availableNotificationPreview(engine.deliveryAtomic, own.key, id);
  if (!preview) return null;
  const names = await engine.contactDisplayNames();
  const saved = preview.phone
    ? await savedPhoneName(preview.phone, engine.currentEnrollment()?.phone).catch(() => null)
    : null;
  const name = saved ?? names.get(preview.sender) ?? preview.name;
  const chat = await engine.chat(preview.chat);
  return {
    chat: preview.chat,
    title: chat?.kind === 'group' ? `${name} · ${chat.title}` : name,
    body: notificationText(preview, language),
  };
}
