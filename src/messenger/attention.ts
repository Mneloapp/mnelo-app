import { useQuery } from '@tanstack/react-query';
import { useDevice } from './DeviceProvider';
export function useAttentionCounts(enabled = true) {
  const { engine, identity } = useDevice();
  return useQuery({
    queryKey: ['device', 'attention', identity?.key],
    queryFn: () => engine.attentionCounts(),
    enabled: Boolean(identity) && enabled,
    networkMode: 'always',
  });
}
