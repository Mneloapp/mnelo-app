export type PlaceCoordinate = { latitude: number; longitude: number };
export function coordinateBody(point: PlaceCoordinate) {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  )
    throw new Error('LOCATION_INVALID');
  return `${Number(point.latitude.toFixed(6))},${Number(point.longitude.toFixed(6))}`;
}
