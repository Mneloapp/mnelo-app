import type { TFunction } from 'i18next';
const statusKeys = {
  ended: 'calls.ended',
  missed: 'calls.missed',
  declined: 'calls.declined',
  failed: 'calls.failed',
} as const;
export function callEventLabel(body: string, t: TFunction) {
  const parts = /^(voice|video):(ended|missed|declined|failed)$/.exec(body);
  if (!parts) return t('chat.callEvent');
  return t('calls.event', {
    media: t(parts[1] === 'video' ? 'calls.video' : 'calls.voice'),
    status: t(statusKeys[parts[2] as keyof typeof statusKeys]),
  });
}
