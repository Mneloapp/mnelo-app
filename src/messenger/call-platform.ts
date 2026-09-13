export async function captureCall(video: boolean) {
  return navigator.mediaDevices.getUserMedia({ audio: true, video });
}
export async function stopCallAudio() {}
export async function speakerOutput(_enabled: boolean) {
  throw new Error('AUDIO_ROUTE_UNAVAILABLE');
}
export async function switchCallCamera(_stream: MediaStream) {
  throw new Error('CAMERA_SWITCH_UNAVAILABLE');
}
