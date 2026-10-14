// 1:1 voice calls: WebRTC peer + polling-based signalling through the API.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useReducer } from 'react';
import { Platform, Vibration } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { api, Call, errorText } from './api';
import { attachRemote, createPeer, detachRemote, getMic, rtcAvailable, sessionDescription } from './rtc';

export type Phase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

type State = {
  phase: Phase;
  role: 'caller' | 'callee' | null;
  callId: number | null;
  conversationId: number | null;
  peerName: string;
  peerAvatar: string | null;
  connectedAt: number | null;
  muted: boolean;
  note: string | null;
};

const initial: State = {
  phase: 'idle',
  role: null,
  callId: null,
  conversationId: null,
  peerName: '',
  peerAvatar: null,
  connectedAt: null,
  muted: false,
  note: null,
};

let state: State = { ...initial };
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getCallState() {
  return state;
}
export function useCallState() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return state;
}

let pc: any = null;
let localStream: any = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let answerApplied = false;
let ring: ReturnType<typeof createAudioPlayer> | null = null;
let endTimer: ReturnType<typeof setTimeout> | undefined;

// ------------------------------------------------------------------ sounds
function playLoop(kind: 'ring' | 'ringback') {
  stopSounds();
  try {
    const src = kind === 'ring' ? require('../assets/sounds/ring.wav') : require('../assets/sounds/ringback.wav');
    ring = createAudioPlayer(src);
    ring.loop = true;
    ring.volume = kind === 'ring' ? 1 : 0.6;
    ring.play();
  } catch {
    ring = null;
  }
  if (kind === 'ring' && Platform.OS !== 'web') Vibration.vibrate([0, 600, 900], true);
}

function stopSounds() {
  try {
    ring?.pause();
    ring?.remove();
  } catch {
    /* already gone */
  }
  ring = null;
  if (Platform.OS !== 'web') Vibration.cancel();
}

// ------------------------------------------------------------------ helpers
async function iceConfig() {
  try {
    const r = await api<{ iceServers: unknown[] }>('/calls/ice');
    return { iceServers: r.iceServers };
  } catch {
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }
}

function waitForIce(peer: any, ms = 3500) {
  return new Promise<void>((resolve) => {
    if (peer.iceGatheringState === 'complete') return resolve();
    const timer = setTimeout(resolve, ms);
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function wirePeer(peer: any) {
  peer.addEventListener('track', (e: any) => {
    const stream = e.streams?.[0];
    if (stream) attachRemote(stream);
  });
  peer.addEventListener('connectionstatechange', () => {
    const s = peer.connectionState;
    if (s === 'connected' && state.phase !== 'active') {
      stopSounds();
      set({ phase: 'active', connectedAt: Date.now(), note: null });
    } else if (s === 'failed') {
      hangUp('failed');
    }
  });
}

function cleanup() {
  clearTimeout(pollTimer);
  stopSounds();
  try {
    localStream?.getTracks?.().forEach((t: any) => t.stop());
  } catch {
    /* ignore */
  }
  try {
    pc?.close();
  } catch {
    /* ignore */
  }
  detachRemote();
  pc = null;
  localStream = null;
  answerApplied = false;
  try {
    deactivateKeepAwake('dabba-call');
  } catch {
    /* ignore */
  }
  setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
}

function finish(note: string) {
  cleanup();
  set({ phase: 'ended', note });
  clearTimeout(endTimer);
  endTimer = setTimeout(() => set({ ...initial }), 1800);
}

function endNote(c: Call) {
  switch (c.status) {
    case 'declined':
      return state.role === 'caller' ? 'Call declined' : 'Call ended';
    case 'missed':
      return state.role === 'caller' ? 'No answer' : 'Missed call';
    case 'cancelled':
      return state.role === 'caller' ? 'Call cancelled' : 'Missed call';
    case 'failed':
      return 'Call failed';
    default:
      return 'Call ended';
  }
}

function poll() {
  clearTimeout(pollTimer);
  const wait = state.phase === 'active' ? 3000 : 1500;
  pollTimer = setTimeout(async () => {
    const id = state.callId;
    if (!id || state.phase === 'idle' || state.phase === 'ended') return;
    try {
      const r = await api<{ call: Call }>(`/calls/${id}`);
      await onServer(r.call);
    } catch {
      /* transient network issue — keep trying */
    }
    if (inCall()) poll();
  }, wait);
}

async function onServer(c: Call) {
  if (['ended', 'missed', 'declined', 'cancelled', 'failed'].includes(c.status)) {
    finish(endNote(c));
    return;
  }
  if (state.role === 'caller' && c.status === 'active' && c.answer && !answerApplied && pc) {
    answerApplied = true;
    stopSounds();
    set({ phase: 'connecting', note: null });
    try {
      await pc.setRemoteDescription(sessionDescription(JSON.parse(c.answer)));
    } catch {
      hangUp('failed');
    }
  }
}

async function preparePeer() {
  const why = rtcAvailable();
  if (why) throw new Error(why);
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }).catch(() => {});
  try {
    localStream = await getMic();
  } catch {
    throw new Error('Microphone permission is needed for calls. Allow it in your settings and try again.');
  }
  pc = createPeer(await iceConfig());
  wirePeer(pc);
  localStream.getTracks().forEach((t: any) => pc.addTrack(t, localStream));
  activateKeepAwakeAsync('dabba-call').catch(() => {});
}

// ------------------------------------------------------------------ public API
export function inCall() {
  return state.phase !== 'idle' && state.phase !== 'ended';
}

export async function startCall(conversationId: number, peer: { name: string; avatarUrl: string | null }) {
  if (inCall()) throw new Error('You are already on a call.');
  clearTimeout(endTimer);
  set({ ...initial, phase: 'outgoing', role: 'caller', conversationId, peerName: peer.name, peerAvatar: peer.avatarUrl, note: 'Calling…' });
  try {
    await preparePeer();
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    const r = await api<{ call: Call }>('/calls', { body: { conversationId, offer: JSON.stringify(pc.localDescription) } });
    if (state.phase !== 'outgoing') {
      // user hung up while we were setting up
      api(`/calls/${r.call.id}/end`, { body: {} }).catch(() => {});
      return;
    }
    set({ callId: r.call.id, note: 'Ringing…' });
    playLoop('ringback');
    poll();
  } catch (e) {
    finish(errorText(e));
  }
}

export function receiveIncoming(c: Call) {
  if (inCall() || state.callId === c.id) return;
  clearTimeout(endTimer);
  set({
    ...initial,
    phase: 'incoming',
    role: 'callee',
    callId: c.id,
    conversationId: c.conversationId,
    peerName: c.peer?.displayName || 'Dabba user',
    peerAvatar: c.peer?.avatarUrl || null,
    note: 'Incoming voice call',
  });
  playLoop('ring');
  poll();
}

export async function acceptCall() {
  const id = state.callId;
  if (!id || state.phase !== 'incoming') return;
  stopSounds();
  set({ phase: 'connecting', note: 'Connecting…' });
  try {
    const r = await api<{ call: Call }>(`/calls/${id}`);
    if (r.call.status !== 'ringing' || !r.call.offer) {
      finish(endNote(r.call));
      return;
    }
    await preparePeer();
    await pc.setRemoteDescription(sessionDescription(JSON.parse(r.call.offer)));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc);
    await api(`/calls/${id}/answer`, { body: { answer: JSON.stringify(pc.localDescription) } });
    poll();
  } catch (e) {
    api(`/calls/${id}/end`, { body: { reason: 'failed' } }).catch(() => {});
    finish(errorText(e));
  }
}

export async function hangUp(reason?: 'failed') {
  const id = state.callId;
  const wasIncoming = state.phase === 'incoming';
  finish(reason === 'failed' ? 'Call failed — check your connection' : wasIncoming ? 'Call declined' : 'Call ended');
  if (id) api(`/calls/${id}/end`, { body: reason ? { reason } : {} }).catch(() => {});
}

export function toggleMute() {
  const muted = !state.muted;
  try {
    localStream?.getAudioTracks?.().forEach((t: any) => {
      t.enabled = !muted;
    });
  } catch {
    /* ignore */
  }
  set({ muted });
}
