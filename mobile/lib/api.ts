import { Platform } from 'react-native';

// ------------------------------------------------------------------ types
export type Person = {
  id: number;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  about: string | null;
  lastSeenAt: string | null;
  online: boolean;
};

export type Me = {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  about: string | null;
  statusText: string | null;
  readReceipts: boolean;
  hidePreviews: boolean;
  securityQuestion: string | null;
  createdAt: string | null;
};

export type TickStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type Conversation = {
  id: number;
  type: 'direct' | 'group' | 'self';
  title: string | null;
  name: string;
  other: Person | null;
  avatarUrl: string | null;
  memberCount: number;
  lastMessage: {
    id: number;
    kind: string;
    body: string | null;
    senderId: number;
    senderName: string;
    createdAt: string;
    deleted: boolean;
    durationMs: number | null;
    status: TickStatus | null;
  } | null;
  unread: number;
  typing: string | null;
  muted: boolean;
  mutedUntil: string | null;
  archived: boolean;
  pinned: boolean;
  pinnedAt: string | null;
  favorite: boolean;
  wallpaper: string | null;
  disappearAfterSec: number | null;
  updatedAt: string;
};

export type Reaction = { memberId: number; emoji: string; name: string };

export type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderAvatar: string | null;
  kind: 'text' | 'image' | 'audio' | 'call' | 'system' | string;
  body: string | null;
  mediaUrl: string | null;
  durationMs: number | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  expiresAt: string | null;
  pinnedAt: string | null;
  forwarded: boolean;
  starred: boolean;
  reactions: Reaction[];
  replyTo: {
    id: number;
    senderId: number;
    senderName: string;
    kind: string;
    body: string | null;
    mediaUrl: string | null;
    deleted: boolean;
  } | null;
  status?: TickStatus;
  chatName?: string;
  localUri?: string | null;
};

export type ChatMeta = {
  id: number;
  type: 'direct' | 'group' | 'self';
  name: string;
  memberCount: number;
  disappearAfterSec: number | null;
  wallpaper: string | null;
  other: { id: number; name: string; avatarUrl: string | null; username: string | null; lastSeenAt: string | null; online: boolean } | null;
};

export type Call = {
  id: number;
  conversationId: number;
  direction: 'incoming' | 'outgoing';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'cancelled' | 'failed' | string;
  peer: Person | null;
  offer?: string | null;
  answer?: string | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number;
};

// ------------------------------------------------------------------ base URL
function resolveBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const { protocol, host } = window.location;
    // Live preview (https://8081-<sandbox>.e2b.app) → backend on port 3000.
    const m = host.match(/^(\d+)-(.+)$/);
    if (m) return `${protocol}//3000-${m[2]}`;
    if (/^(localhost|127\.0\.0\.1):\d+$/.test(host)) return `${protocol}//${host.split(':')[0]}:3000`;
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return '';
}

export const API_BASE = resolveBase();

export function mediaUri(url?: string | null): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:|file:|content:)/.test(url)) return url;
  return `${API_BASE}${url}`;
}

// ------------------------------------------------------------------ requests
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}
export function getToken() {
  return token;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Opts = { method?: string; body?: unknown; signal?: AbortSignal; quiet401?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method: opts.method || (body !== undefined ? 'POST' : 'GET'),
      headers,
      body,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, "Can't reach Dabba right now. Check your internet connection.");
  }
  const raw = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && token && !opts.quiet401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data?.error || `Something went wrong (${res.status}).`);
  }
  return data as T;
}

export async function uploadFile(uri: string, name: string, type: string): Promise<{ id: string; url: string; mime: string }> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, name);
  } else {
    // React Native's FormData accepts { uri, name, type } file descriptors.
    form.append('file', { uri, name, type } as unknown as Blob);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/media`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch {
    throw new ApiError(0, "Couldn't upload. Check your internet connection.");
  }
  const raw = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Upload failed (${res.status}).`);
  return data;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
