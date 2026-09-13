import makeQR from 'qrcode-generator';

export function qrGeometry(value: string) {
  if (value.length > 600) throw new Error('QR_TOO_LARGE');
  const qr = makeQR(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  let path = '';
  for (let y = 0; y < count; y++)
    for (let x = 0; x < count; x++) if (qr.isDark(y, x)) path += `M${x + 4},${y + 4}h1v1h-1z`;
  return { path, size: count + 8 };
}
