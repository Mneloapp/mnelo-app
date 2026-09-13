// Bound both encoded bytes and decoded dimensions before handing a peer image to native UI.
// JPEG only: no SVG, remote URLs, metadata URLs or animated image formats.
export function validAvatar(value: string): boolean {
  if (value.length > 48_000 || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    return false;
  try {
    const data = atob(value);
    const byte = (index: number) => data.charCodeAt(index);
    const word = (index: number) => byte(index) * 256 + byte(index + 1);
    if (word(0) !== 0xffd8 || word(data.length - 2) !== 0xffd9) return false;
    for (let offset = 2; offset + 4 < data.length;) {
      if (byte(offset++) !== 0xff) return false;
      while (byte(offset) === 0xff) offset++;
      const marker = byte(offset++);
      if (marker === 0xda || marker === 0xd9) return false;
      const length = word(offset);
      if (length < 2 || offset + length > data.length) return false;
      if (marker === 0xc0 || marker === 0xc2) {
        const height = word(offset + 3),
          width = word(offset + 5);
        return length >= 8 && width > 0 && height > 0 && width <= 384 && height <= 384;
      }
      offset += length;
    }
  } catch {
    /* Untrusted image data is rejected. */
  }
  return false;
}
export const avatarUri = (value: string) => (value ? 'data:image/jpeg;base64,' + value : undefined);
