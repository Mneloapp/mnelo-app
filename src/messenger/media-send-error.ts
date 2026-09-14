export class MediaBatchError extends Error {
  constructor(
    readonly sent: number,
    readonly total: number,
    override readonly cause: unknown,
  ) {
    super('MEDIA_BATCH_PARTIAL');
  }
}

export function mediaErrorMessage(cause: unknown) {
  if (cause instanceof MediaBatchError)
    return { key: 'mediaBatchPartial' as const, values: { sent: cause.sent, total: cause.total } };
  const code = cause instanceof Error ? cause.message : '';
  const keys = {
    MEDIA_SIZE_LIMIT: 'mediaLimit',
    VIDEO_SIZE_LIMIT: 'videoLimit',
    MEDIA_DURATION_LIMIT: 'videoDurationLimit',
    MEDIA_SELECTION_LIMIT: 'mediaSelectionLimit',
    MEDIA_PICKER_FAILED: 'mediaPickerFailed',
    MEDIA_READ_FAILED: 'mediaReadFailed',
    CAMERA_PERMISSION_REQUIRED: 'cameraPermission',
  } as const;
  return { key: keys[code as keyof typeof keys] ?? ('genericError' as const), values: {} };
}
