import { useLocalSearchParams } from 'expo-router';
import { FindPhoneScreen } from '@/messenger/screens/FindPhoneScreen';
export default function NumberScreen() {
  const { number } = useLocalSearchParams<{ number?: string }>();
  const initialNumber = typeof number === 'string' && number.length <= 30 ? number : '';
  return <FindPhoneScreen nativeHeader keypad intent="call" initialNumber={initialNumber} />;
}
