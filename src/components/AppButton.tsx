import { Button } from './ui';
export function AppButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button label={label} onPress={onPress} />;
}
