import { RepositoryError, type MneloRepository } from '../repository';
import { supabaseClient } from './client';
import { repositoryError } from './errors';
import { decodeCursor } from '@/features/chats/cursor';
export function devicesRepository(): Pick<MneloRepository, 'devices' | 'currentDeviceId'> {
  const client = supabaseClient();
  return {
    async currentDeviceId() {
      const { data, error } = await client.rpc('current_device');
      if (error) throw repositoryError(error);
      if (!data?.[0]?.id) throw new RepositoryError('UNAUTHORIZED');
      return data[0].id;
    },
    async devices(cursor) {
      const { data, error } = await client.rpc('list_devices', decodeCursor(cursor));
      if (error) throw repositoryError(error);
      const current = cursor ? undefined : await client.rpc('current_device');
      if (current?.error) throw repositoryError(current.error);
      const own = current?.data?.[0];
      const items = own ? [own, ...(data ?? []).filter((d) => d.id !== own.id)] : (data ?? []);
      return items.map((d) => ({
        id: d.id,
        label: d.label,
        platform: d.platform,
        osVersion: d.os_version,
        createdAt: d.created_at,
        lastActiveAt: d.last_active_at,
        current: d.is_current,
      }));
    },
  };
}
