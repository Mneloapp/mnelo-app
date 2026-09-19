import { requireOptionalNativeModule } from 'expo-modules-core';
import type { PlaceCoordinate } from './location-coordinate';
export { coordinateBody } from './location-coordinate';
export type { PlaceCoordinate } from './location-coordinate';
const native = requireOptionalNativeModule<{
  choose(labels: Record<string, string>): Promise<PlaceCoordinate | null>;
}>('MneloLocation');
export function nativePlacePickerAvailable() {
  return Boolean(native);
}
export async function choosePlace(labels: Record<string, string>) {
  if (!native) throw new Error('LOCATION_UNAVAILABLE');
  return native.choose(labels);
}
