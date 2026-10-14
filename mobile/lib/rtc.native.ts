// Native WebRTC via react-native-webrtc (included in the installed APK build).
// Expo Go doesn't ship this module, so it's loaded lazily and fails softly.
/* eslint-disable @typescript-eslint/no-explicit-any */

let mod: any = null;
let loadError: string | null = null;

function load() {
  if (mod || loadError) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('react-native-webrtc');
  } catch {
    loadError = 'Voice calls need the installed Dabba app (they don’t work inside Expo Go).';
  }
  return mod;
}

export function rtcAvailable(): string | null {
  load();
  return mod ? null : loadError;
}

export function createPeer(config: any): any {
  return new (load().RTCPeerConnection)(config);
}

export function sessionDescription(init: { type: string; sdp: string }): any {
  return new (load().RTCSessionDescription)(init);
}

export async function getMic(): Promise<any> {
  return load().mediaDevices.getUserMedia({ audio: true, video: false });
}

// Remote audio plays automatically through the call audio route on phones.
export function attachRemote(_stream: any) {}
export function detachRemote() {}
