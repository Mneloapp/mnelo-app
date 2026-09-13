import { usePreferences } from '@/stores/preferences';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
export function deviceInfo() {
  return {
    locale: usePreferences.getState().locale,
    name:
      Device.modelName ??
      (Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Browser'),
    platform:
      Platform.OS === 'ios'
        ? ('ios' as const)
        : Platform.OS === 'android'
          ? ('android' as const)
          : ('web' as const),
    osVersion: Device.osVersion ?? '',
  };
}
