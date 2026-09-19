import type { PlaceCoordinate } from './location-coordinate';
export { coordinateBody } from './location-coordinate';
export type { PlaceCoordinate } from './location-coordinate';
export function nativePlacePickerAvailable() {
  return false;
}
export async function choosePlace(
  _labels: Record<string, string>,
): Promise<PlaceCoordinate | null> {
  throw new Error('LOCATION_UNAVAILABLE');
}
