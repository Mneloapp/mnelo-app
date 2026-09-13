import type { MneloRepository } from '../repository';
import { supabaseClient } from './client';
import { repositoryError } from './errors';
export function notificationsRepository(): Pick<
  MneloRepository,
  | 'notificationPreferences'
  | 'updateNotificationPreferences'
  | 'registerDevice'
  | 'registerPush'
  | 'disablePush'
  | 'resolveNotification'
> {
  const client = supabaseClient();
  return {
    async notificationPreferences() {
      const { data, error } = await client
        .from('notification_preferences')
        .select('messages,requests,matches,calls')
        .single();
      if (error) throw repositoryError(error);
      return data;
    },
    async updateNotificationPreferences(settings) {
      const { error } = await client.rpc('update_notification_preferences', settings);
      if (error) throw repositoryError(error);
    },
    async registerDevice(input) {
      const { data, error } = await client.rpc('register_device', {
        device_name: input.name,
        platform: input.platform,
        os_version: input.osVersion,
        locale: input.locale ?? 'en',
      });
      if (error) throw repositoryError(error);
      return data;
    },
    async registerPush(device, token) {
      const { error } = await client.rpc('register_push_token', { device, push_token: token });
      if (error) throw repositoryError(error);
    },
    async disablePush() {
      const { error } = await client.rpc('disable_current_push');
      if (error) throw repositoryError(error);
    },
    async resolveNotification(id) {
      const { data, error } = await client.rpc('resolve_notification', { notification: id });
      if (error) throw repositoryError(error);
      const result = data?.[0];
      return result ? { event: result.event_type, target: result.target_id } : null;
    },
  };
}
