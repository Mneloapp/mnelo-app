import jpeg from 'npm:jpeg-js@0.4.4';
import { parseBuffer } from 'npm:music-metadata@11.15.0';
export async function validateMedia(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error('INVALID');
  if (mime === 'image/jpeg') {
    const pixels = jpeg.decode(bytes, {
      useTArray: true,
      tolerantDecoding: false,
      maxResolutionInMP: 4,
      maxMemoryUsageInMB: 64,
    });
    if (pixels.width > 1600 || pixels.height > 1600) throw new Error('INVALID');
    const clean = jpeg.encode(
      { width: pixels.width, height: pixels.height, data: pixels.data },
      80,
    ).data;
    return { bytes: Uint8Array.from(clean), mime, duration: null };
  }
  if (mime === 'audio/mp4') {
    const metadata = await parseBuffer(
      bytes,
      { mimeType: mime, size: bytes.byteLength },
      { duration: true, skipCovers: true },
    );
    const duration = metadata.format.duration;
    if (
      !metadata.format.container?.includes('M4A') &&
      !metadata.format.container?.includes('isom') &&
      !metadata.format.container?.includes('MPEG-4')
    )
      throw new Error('INVALID');
    if (
      !duration ||
      !Number.isFinite(duration) ||
      duration > 600 ||
      !metadata.format.codec?.includes('AAC')
    )
      throw new Error('INVALID');
    return { bytes, mime, duration };
  }
  if (mime === 'application/pdf') {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('INVALID');
  } else if (mime === 'text/plain') {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.includes(0)) throw new Error('INVALID');
  } else if (mime !== 'application/octet-stream') throw new Error('INVALID');
  return { bytes, mime, duration: null };
}
