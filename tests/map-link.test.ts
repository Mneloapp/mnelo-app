import { mapLink, sharedMapLink } from '@/messenger/map-link';
test('map providers receive only validated coordinates after explicit selection', () => {
  expect(mapLink('google', '41.7,44.8')).toBe(
    'https://www.google.com/maps/search/?api=1&query=41.7%2C44.8',
  );
  expect(mapLink('apple', '-41.7,44.8')).toBe('https://maps.apple.com/?ll=-41.7%2C44.8');
  for (const value of [
    '91,0',
    '0,181',
    'NaN,0',
    '41,44&url=https://example.com',
    'https://example.com',
    '0,0,0',
  ])
    expect(() => mapLink('google', value)).toThrow('LOCATION_INVALID');
});

test('shared Maps destinations keep exact selected-place URLs without allowing deceptive domains', () => {
  expect(sharedMapLink('Favourite place\nhttps://maps.app.goo.gl/Abc123')).toEqual({
    provider: 'google',
    url: 'https://maps.app.goo.gl/Abc123',
  });
  expect(sharedMapLink('https://maps.apple.com/?address=Tbilisi')?.provider).toBe('apple');
  for (const input of [
    'https://maps.apple.com.evil.example/?q=place',
    'https://evil.example/?url=https%3A%2F%2Fmaps.apple.com',
    'https://google.com/account',
    'https://maps.app.goo.gl@evil.example/a',
    'javascript:alert(1)',
    'https://maps.apple.com:8443/',
  ])
    expect(sharedMapLink(input)).toBeNull();
});
