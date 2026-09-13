import type { MneloRepository } from '../repository';
import { RepositoryError } from '../repository';
import { supabaseClient } from './client';
import { repositoryError } from './errors';
import { mapProfile } from './profile-repository';
export function groupRepository(): Pick<
  MneloRepository,
  | 'createGroup'
  | 'group'
  | 'renameGroup'
  | 'addGroupMember'
  | 'manageGroupMember'
  | 'leaveGroup'
  | 'setGroupAvatar'
  | 'connections'
> {
  const client = supabaseClient();
  return {
    async createGroup(name, members, clientId) {
      const { data: id, error } = await client.rpc('create_group', {
        name,
        members,
        client_id: clientId,
      });
      if (error) throw repositoryError(error);
      const row = await client
        .from('conversations')
        .select('id,title,updated_at,created_by')
        .eq('id', id)
        .single();
      if (row.error) throw repositoryError(row.error);
      return {
        id: row.data.id,
        title: row.data.title,
        kind: 'group',
        memberIds: [...members, ...(row.data.created_by ? [row.data.created_by] : [])],
        preview: '',
        updatedAt: row.data.updated_at,
        unreadCount: 0,
      };
    },
    async group(id) {
      const { data, error } = await client.rpc('get_group', { conversation: id });
      if (error) throw repositoryError(error);
      if (!data?.[0]) throw new RepositoryError('FORBIDDEN');
      return {
        id,
        title: data[0].title,
        avatarId: data[0].avatar_attachment_id,
        members: data.map((m) => ({
          id: m.member_id,
          displayName: m.display_name,
          username: m.username,
          role: m.role === 'admin' ? 'admin' : 'member',
        })),
      };
    },
    async renameGroup(id, name) {
      const { error } = await client.rpc('rename_group', { conversation: id, name });
      if (error) throw repositoryError(error);
    },
    async addGroupMember(id, target) {
      const { error } = await client.rpc('add_group_member', { conversation: id, target });
      if (error) throw repositoryError(error);
    },
    async manageGroupMember(id, target, action) {
      const { error } = await client.rpc('manage_group_member', {
        conversation: id,
        target,
        action,
      });
      if (error) throw repositoryError(error);
    },
    async leaveGroup(id) {
      const { error } = await client.rpc('leave_group', { conversation: id });
      if (error) throw repositoryError(error);
    },
    async setGroupAvatar(id, attachment) {
      const { error } = await client.rpc('set_group_avatar', {
        conversation: id,
        ...(attachment ? { attachment } : {}),
      });
      if (error) throw repositoryError(error);
    },
    async connections(query = '') {
      const { data, error } = await client.rpc('list_connections', { query });
      if (error) throw repositoryError(error);
      return (data ?? []).map(mapProfile);
    },
  };
}
