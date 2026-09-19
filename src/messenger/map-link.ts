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

// Preserve the selected place (including short links) without fetching or
// guessing coordinates. Only actual Maps URLs get the location action.
export function sharedMapLink(body: string): { url: string; provider: 'apple' | 'google' } | null {
  for (const match of body.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    try {
      const url = new URL(match[0]);
      if (url.username || url.password || url.port) continue;
      const host = url.hostname.toLowerCase();
      const apple = host === 'maps.apple.com';
      const google =
        host === 'maps.app.goo.gl' ||
        host === 'maps.google.com' ||
        ((host === 'google.com' || host === 'www.google.com') &&
          /^\/maps(?:\/|$)/.test(url.pathname));
      if (!apple && !google) continue;
      url.protocol = 'https:';
      return { url: url.href, provider: apple ? 'apple' : 'google' };
    } catch {
      /* Malformed shared text is not a map destination. */
    }
  }
  return null;
}
