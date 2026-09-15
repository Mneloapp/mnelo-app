import { RTCPeerConnection as NativePeer } from '@livekit/react-native-webrtc';
import { prepareNativeWebRTC } from './native-webrtc';

export function makePeer(configuration: RTCConfiguration): RTCPeerConnection {
  prepareNativeWebRTC();
  // Platform adapter: react-native-webrtc exposes the corresponding WebRTC methods/events.
  // Do not import the LiveKit SFU Room abstraction into the direct peer transport.
  return new NativePeer(configuration) as unknown as RTCPeerConnection;
}
