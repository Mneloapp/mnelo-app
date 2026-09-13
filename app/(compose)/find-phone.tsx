import { useLocalSearchParams } from 'expo-router';
import { FindPhoneScreen } from '@/messenger/screens/FindPhoneScreen';
export default function NumberScreen() {
  const { number, saveOnly } = useLocalSearchParams<{ number?: string; saveOnly?: string }>();
  const initialNumber = typeof number === 'string' && number.length <= 30 ? number : '';
  return <FindPhoneScreen nativeHeader saveOnly={saveOnly === '1'} initialNumber={initialNumber} />;
}
