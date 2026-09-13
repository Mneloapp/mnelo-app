export async function captureCall(video: boolean, group = false) {
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: video && group ? { width: 480, height: 360, frameRate: 15 } : video,
  });
}
export async function stopCallAudio() {}
export async function speakerOutput(_enabled: boolean) {
  throw new Error('AUDIO_ROUTE_UNAVAILABLE');
}
export async function switchCallCamera(_stream: MediaStream) {
  throw new Error('CAMERA_SWITCH_UNAVAILABLE');
}

export function callOutputStream(local: MediaStream, screen: MediaStream): MediaStream {
  return new MediaStream([...local.getAudioTracks(), ...screen.getVideoTracks()]);
}
