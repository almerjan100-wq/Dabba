// On-device lock codes.
//  • App PIN: guards the whole app (asked at launch / after being away).
//  • Chat codes: every locked chat has its OWN code, independent of the app PIN.
// Codes are salted + SHA-256 hashed and kept in the Keychain/Keystore
// (localStorage in the browser preview). 5 wrong tries → 30 s cooldown that
// doubles each time (max 10 min), tracked per scope and kept across restarts.
import { useEffect, useReducer } from 'react';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { deleteItem, getItem, getJSON, setItem, setJSON } from './storage';

const K = {
  appPin: 'dabba_app_pin',
  appBio: 'dabba_app_bio',
  chatPins: 'dabba_chat_pins',
  chatBio: 'dabba_chat_bio',
  guard: (scope: string) => `dabba_guard_${scope}`,
};

type Guard = { fails: number; until: number; level: number };
export type VerifyResult = { ok: true } | { ok: false; waitMs: number; attemptsLeft: number };

let loaded = false;
let appPin: string | null = null;
let appBio = false;
let chatPins: Record<string, string> = {};
let chatBio: Record<string, boolean> = {};
let appUnlocked = false;
const unlockedChats = new Set<number>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeLocks(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useLockState() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeLocks(force), []);
}

async function hashWithSalt(pin: string, scope: string, salt: string) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${scope}:${pin}`);
  return `${salt}:${digest}`;
}

async function hashPin(pin: string, scope: string) {
  return hashWithSalt(pin, scope, Crypto.randomUUID().replace(/-/g, ''));
}

async function getGuard(scope: string): Promise<Guard> {
  return getJSON<Guard>(K.guard(scope), { fails: 0, until: 0, level: 0 });
}
async function saveGuard(scope: string, g: Guard) {
  await setJSON(K.guard(scope), g);
}
async function resetGuard(scope: string) {
  await deleteItem(K.guard(scope));
}

async function verify(scope: string, pin: string, stored: string | null): Promise<VerifyResult> {
  const g = await getGuard(scope);
  const now = Date.now();
  if (g.until > now) return { ok: false, waitMs: g.until - now, attemptsLeft: 0 };
  if (!stored) return { ok: false, waitMs: 0, attemptsLeft: 5 };
  const [salt] = stored.split(':');
  if ((await hashWithSalt(pin, scope, salt)) === stored) {
    await resetGuard(scope);
    return { ok: true };
  }
  const fails = g.fails + 1;
  if (fails >= 5) {
    const wait = Math.min(30_000 * 2 ** g.level, 600_000);
    await saveGuard(scope, { fails: 0, until: now + wait, level: g.level + 1 });
    return { ok: false, waitMs: wait, attemptsLeft: 0 };
  }
  await saveGuard(scope, { ...g, fails, until: 0 });
  return { ok: false, waitMs: 0, attemptsLeft: 5 - fails };
}

export async function lockWait(scope: 'app' | number): Promise<number> {
  const g = await getGuard(scope === 'app' ? 'app' : `chat${scope}`);
  return Math.max(0, g.until - Date.now());
}

export async function loadLocks() {
  if (loaded) return;
  appPin = await getItem(K.appPin);
  appBio = (await getItem(K.appBio)) === '1';
  chatPins = await getJSON<Record<string, string>>(K.chatPins, {});
  chatBio = await getJSON<Record<string, boolean>>(K.chatBio, {});
  loaded = true;
  emit();
}

export function locksLoaded() {
  return loaded;
}

// ------------------------------------------------------------------ app PIN
export function hasAppPin() {
  return !!appPin;
}
export async function setAppPin(pin: string) {
  appPin = await hashPin(pin, 'app');
  await setItem(K.appPin, appPin);
  await resetGuard('app');
  appUnlocked = true;
  emit();
}
export async function clearAppPin() {
  appPin = null;
  appBio = false;
  await deleteItem(K.appPin);
  await deleteItem(K.appBio);
  await resetGuard('app');
  emit();
}
export async function verifyAppPin(pin: string) {
  const r = await verify('app', pin, appPin);
  if (r.ok) {
    appUnlocked = true;
    emit();
  }
  return r;
}
export function getAppBio() {
  return appBio;
}
export async function setAppBio(on: boolean) {
  appBio = on;
  if (on) await setItem(K.appBio, '1');
  else await deleteItem(K.appBio);
  emit();
}
export function isAppUnlocked() {
  return appUnlocked || !appPin;
}
export function markAppUnlocked() {
  appUnlocked = true;
  emit();
}

// ------------------------------------------------------------------ chat codes
export function isChatLocked(id: number) {
  return !!chatPins[String(id)];
}
export function lockedChatIds(): number[] {
  return Object.keys(chatPins).map(Number);
}
export async function setChatPin(id: number, pin: string) {
  chatPins = { ...chatPins, [String(id)]: await hashPin(pin, `chat${id}`) };
  await setJSON(K.chatPins, chatPins);
  await resetGuard(`chat${id}`);
  unlockedChats.add(id);
  emit();
}
export async function verifyChatPin(id: number, pin: string) {
  const r = await verify(`chat${id}`, pin, chatPins[String(id)] || null);
  if (r.ok) {
    unlockedChats.add(id);
    emit();
  }
  return r;
}
export async function removeChatLock(id: number) {
  const nextPins = { ...chatPins };
  delete nextPins[String(id)];
  chatPins = nextPins;
  const nextBio = { ...chatBio };
  delete nextBio[String(id)];
  chatBio = nextBio;
  await setJSON(K.chatPins, chatPins);
  await setJSON(K.chatBio, chatBio);
  await resetGuard(`chat${id}`);
  unlockedChats.delete(id);
  emit();
}
export function getChatBio(id: number) {
  return !!chatBio[String(id)];
}
export async function setChatBio(id: number, on: boolean) {
  chatBio = { ...chatBio, [String(id)]: on };
  if (!on) delete chatBio[String(id)];
  await setJSON(K.chatBio, chatBio);
  emit();
}
export function isChatUnlocked(id: number) {
  return unlockedChats.has(id);
}
export function markChatUnlocked(id: number) {
  unlockedChats.add(id);
  emit();
}

// ------------------------------------------------------------------ session
export function relockAll() {
  appUnlocked = false;
  unlockedChats.clear();
  emit();
}

export function relockChats() {
  if (!unlockedChats.size) return;
  unlockedChats.clear();
  emit();
}

export async function clearAllLocks() {
  const scopes = ['app', ...Object.keys(chatPins).map((id) => `chat${id}`)];
  for (const s of scopes) await resetGuard(s);
  await deleteItem(K.appPin);
  await deleteItem(K.appBio);
  await deleteItem(K.chatPins);
  await deleteItem(K.chatBio);
  appPin = null;
  appBio = false;
  chatPins = {};
  chatBio = {};
  appUnlocked = false;
  unlockedChats.clear();
  emit();
}

// ------------------------------------------------------------------ biometrics
export async function bioAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    return hw && enrolled;
  } catch {
    return false;
  }
}

export async function bioPrompt(reason: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Use code',
      disableDeviceFallback: true,
    });
    return r.success;
  } catch {
    return false;
  }
}

export function formatWait(ms: number) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}
