// Browser WebRTC (used by the web preview). The phone build uses rtc.native.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */

let remoteEl: any = null;

export function rtcAvailable(): string | null {
  if (typeof window === 'undefined' || typeof (window as any).RTCPeerConnection === 'undefined') return 'Calls are not supported in this browser.';
  if (!navigator?.mediaDevices?.getUserMedia) return 'This browser cannot use the microphone here.';
  return null;
}

export function createPeer(config: any): any {
  return new (window as any).RTCPeerConnection(config);
}

export function sessionDescription(init: { type: string; sdp: string }): any {
  return new (window as any).RTCSessionDescription(init);
}

export async function getMic(): Promise<any> {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
}

export function attachRemote(stream: any) {
  if (typeof document === 'undefined') return;
  if (!remoteEl) {
    remoteEl = document.createElement('audio');
    remoteEl.autoplay = true;
    remoteEl.setAttribute('playsinline', 'true');
    remoteEl.style.display = 'none';
    document.body.appendChild(remoteEl);
  }
  remoteEl.srcObject = stream;
  remoteEl.play?.().catch(() => {});
}

export function detachRemote() {
  if (remoteEl) {
    try {
      remoteEl.pause?.();
      remoteEl.srcObject = null;
      remoteEl.remove();
    } catch {
      /* ignore */
    }
    remoteEl = null;
  }
}
