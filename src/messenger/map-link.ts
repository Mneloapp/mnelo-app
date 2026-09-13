export function mapLink(provider: 'google' | 'apple', coordinates: string) {
  if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(coordinates)) throw new Error('LOCATION_INVALID');
  const [latitude, longitude] = coordinates.split(',').map(Number);
  if (
    latitude === undefined ||
    longitude === undefined ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new Error('LOCATION_INVALID');
  const point = encodeURIComponent(`${latitude},${longitude}`);
  // Universal Maps URL opens the installed Google app or its website, without an API key.
  return provider === 'google'
    ? `https://www.google.com/maps/search/?api=1&query=${point}`
    : `https://maps.apple.com/?ll=${point}`;
}
