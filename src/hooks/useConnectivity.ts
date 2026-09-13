import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { hasConnection } from '@/lib/connectivity';
export function useConnectivity() {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(hasConnection(s))), []);
  return online;
}
