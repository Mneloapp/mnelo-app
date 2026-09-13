import { RepositoryError } from '@/services/repository';
export const supportsAudioRoute = false;
export async function requestCallMedia(video: boolean) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    stream.getTracks().forEach((t) => t.stop());
  } catch (error) {
    if (
      error instanceof Error &&
      ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name)
    )
      throw new RepositoryError('PERMISSION_REQUIRED');
    throw new RepositoryError('UNAVAILABLE');
  }
}
export async function startCallAudio(_video: boolean) {}
export async function stopCallAudio() {}
export async function selectCallSpeaker(_speaker: boolean) {}
