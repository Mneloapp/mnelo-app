import { mapLink } from '@/messenger/map-link';
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
