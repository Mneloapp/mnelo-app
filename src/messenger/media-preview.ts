export type MediaDimensions = { width: number; height: number };

export function mediaPreviewSize(dimensions: MediaDimensions, availableWidth: number) {
  const ratio = dimensions.width / dimensions.height;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  // Extremely tall screenshots and panoramas use a bounded preview. The viewer
  // always shows the original; normal portrait/landscape media is not cropped.
  const previewRatio = Math.max(0.55, Math.min(1.9, safeRatio));
  const width = Math.max(1, Math.min(320, availableWidth, 400 * previewRatio));
  return { width, height: width / previewRatio };
}

export function visualMediaKind(mime: string | undefined) {
  if (mime === 'image/jpeg' || mime === 'image/png') return 'photo';
  if (mime === 'video/mp4' || mime === 'video/quicktime' || mime === 'video/webm') return 'video';
  return null;
}
