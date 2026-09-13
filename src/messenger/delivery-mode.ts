// Expo inlines this direct public property in each native bundle. Sharing the
// switch keeps displayed retention copy consistent with the selected transport.
const configured = process.env.EXPO_PUBLIC_DELIVERY_V2;
if (configured !== undefined && configured !== '0' && configured !== '1')
  throw new Error('DELIVERY_CONFIGURATION_INVALID');
export const deliveryV2 = configured === '1';
