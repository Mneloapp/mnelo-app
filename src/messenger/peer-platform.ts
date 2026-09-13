export function makePeer(configuration: RTCConfiguration) {
  return new RTCPeerConnection(configuration);
}
