import { Image } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Avatar, ui } from '@/components/ui';
import { repository } from '@/services';
import type { Profile } from '@/types/domain';
export function ProfileAvatar({
  profile,
  size = 'normal',
}: {
  profile: Pick<Profile, 'displayName' | 'avatarPath'>;
  size?: 'normal' | 'large';
}) {
  const q = useQuery({
    queryKey: ['avatar', profile.avatarPath],
    queryFn: () => repository().avatarUrl(profile.avatarPath!),
    enabled: Boolean(profile.avatarPath),
    staleTime: 30000,
    gcTime: 60000,
    refetchInterval: 45000,
  });
  return q.data && !q.isError ? (
    <Image
      source={{ uri: q.data, cache: 'reload' }}
      accessible={false}
      style={[ui.avatar, size === 'large' && ui.avatarLarge]}
    />
  ) : (
    <Avatar name={profile.displayName} size={size} />
  );
}
