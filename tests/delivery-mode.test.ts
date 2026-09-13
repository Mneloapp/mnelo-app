const original = process.env.EXPO_PUBLIC_DELIVERY_V2;
afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_DELIVERY_V2;
  else process.env.EXPO_PUBLIC_DELIVERY_V2 = original;
});
test.each([undefined, '0', '1'])('transport and retention copy share the %s mode', (mode) => {
  if (mode === undefined) delete process.env.EXPO_PUBLIC_DELIVERY_V2;
  else process.env.EXPO_PUBLIC_DELIVERY_V2 = mode;
  jest.isolateModules(() => {
    const { deliveryV2 } = jest.requireActual('@/messenger/delivery-mode');
    const { messengerEn, messengerKa } = jest.requireActual('@/messenger/copy');
    expect(deliveryV2).toBe(mode === '1');
    expect(messengerEn.privacyHint.includes('30 days')).toBe(mode === '1');
    expect(messengerKa.privacyHint.includes('30 დღე')).toBe(mode === '1');
    expect(messengerEn.offlineHint.includes('both devices to be reachable')).toBe(mode !== '1');
  });
});
test('invalid delivery configuration cannot silently select the old transport', () => {
  process.env.EXPO_PUBLIC_DELIVERY_V2 = 'true';
  jest.isolateModules(() => {
    expect(() => jest.requireActual('@/messenger/delivery-mode')).toThrow(
      'DELIVERY_CONFIGURATION_INVALID',
    );
  });
});
