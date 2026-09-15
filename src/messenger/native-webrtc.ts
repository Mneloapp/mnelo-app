import { audioDeviceModuleEvents } from '@livekit/react-native-webrtc';

export function prepareNativeWebRTC() {
  // Direct peers do not call LiveKit's registerGlobals(). The audio engine
  // still needs its lifecycle bridge initialized before capture/negotiation:
  // otherwise each unhandled native callback waits for its two-second timeout.
  // This also reconciles a recreated observer without installing duplicate
  // listeners. CallKit remains responsible for the iOS audio session.
  audioDeviceModuleEvents.setupListeners();
}
