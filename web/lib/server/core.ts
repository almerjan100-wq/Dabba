// Shared server helpers for the Dabba API: database, errors, validation,
// password hashing, sessions, rate limiting and media sniffing.
import { NextRequest, NextResponse } from 'next/server';
import {
  createHash,
  createHmac,
  pbkdf2 as pbkdf2Cb,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'crypto';
import sqlClient from '@/app/api/utils/sql';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sql = sqlClient as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

// ---------------------------------------------------------------- errors
export class HttpError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function fail(status: number, message: string, extra?: Record<string, unknown>): never {
  throw new HttpError(status, message, extra);
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export type Ctx = {
  req: NextRequest;
  p: Record<string, string>;
  ip: string;
  url: URL;
};

export async function readJson<T = Row>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) fail(413, 'Request is too large.');
  if (!text.trim()) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') fail(400, 'Invalid request.');
    return parsed as T;
  } catch {
    fail(400, 'Invalid request.');
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip')) || 'local';
  return ip.trim().slice(0, 64);
}

// ---------------------------------------------------------------- validation
export function text(
  v: unknown,
  label: string,
  { min = 1, max = 200, trim = true }: { min?: number; max?: number; trim?: boolean } = {},
): string {
  if (typeof v !== 'string') fail(400, `${label} is required.`);
  const s = trim ? v.trim() : v;
  if (s.length < min) fail(400, min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`);
  if (s.length > max) fail(400, `${label} must be at most ${max} characters.`);
  return s;
}

export function optText(v: unknown, label: string, max = 200): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail(400, `${label} is invalid.`);
  const s = v.trim();
  if (s.length > max) fail(400, `${label} must be at most ${max} characters.`);
  return s;
}

export function intId(v: unknown, label = 'id'): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > 2147483647) fail(400, `Invalid ${label}.`);
  return n;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function username(v: unknown): string {
  const s = text(v, 'Username', { max: 40 }).replace(/^@/, '').toLowerCase();
  if (!USERNAME_RE.test(s)) fail(400, 'Username must be 3-20 lowercase letters, numbers or underscores.');
  return s;
}

export function email(v: unknown): string {
  const s = text(v, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(s)) fail(400, 'Enter a valid email address.');
  return s;
}

export function password(v: unknown, label = 'Password'): string {
  if (typeof v !== 'string' || v.length < 8) fail(400, `${label} must be at least 8 characters.`);
  if (v.length > 128) fail(400, `${label} is too long.`);
  return v;
}

// ---------------------------------------------------------------- hashing
function scryptAsync(pw: string, salt: string | Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pw, salt, keylen, (err, key) => (err ? reject(err) : resolve(key))),
  );
}
function pbkdf2Async(pw: string, salt: string | Buffer, iter: number, keylen: number, digest: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    pbkdf2Cb(pw, salt, iter, keylen, digest, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const CANONICAL = 'scrypt';
// Older Dabba builds stored "saltHex:keyHex" (16-byte salt, 64-byte key).
// The exact derivation isn't recorded anywhere, so we accept the common
// variants and quietly re-hash to the canonical one after a successful login.
const SCHEMES: Array<[string, (pw: string, salt: string) => Promise<Buffer>]> = [
  ['scrypt', (pw, s) => scryptAsync(pw, s, 64)],
  ['scrypt-bin', (pw, s) => scryptAsync(pw, Buffer.from(s, 'hex'), 64)],
  ['pbkdf2-sha512-100k', (pw, s) => pbkdf2Async(pw, s, 100000, 64, 'sha512')],
  ['pbkdf2-sha512-100k-bin', (pw, s) => pbkdf2Async(pw, Buffer.from(s, 'hex'), 100000, 64, 'sha512')],
  ['pbkdf2-sha512-10k', (pw, s) => pbkdf2Async(pw, s, 10000, 64, 'sha512')],
  ['pbkdf2-sha512-10k-bin', (pw, s) => pbkdf2Async(pw, Buffer.from(s, 'hex'), 10000, 64, 'sha512')],
  ['pbkdf2-sha512-1k', (pw, s) => pbkdf2Async(pw, s, 1000, 64, 'sha512')],
  ['pbkdf2-sha256-100k', (pw, s) => pbkdf2Async(pw, s, 100000, 64, 'sha256')],
];

export async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(plain, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifySecret(
  plain: string,
  stored: string | null | undefined,
): Promise<{ ok: boolean; legacy: boolean }> {
  if (!plain || !stored) {
    await scryptAsync('dummy-password', 'dummy-salt-value', 64);
    return { ok: false, legacy: false };
  }
  const [salt, hex] = stored.split(':');
  if (!salt || !hex || !/^[0-9a-f]+$/i.test(hex)) return { ok: false, legacy: false };
  const expected = Buffer.from(hex, 'hex');
  for (const [name, derive] of SCHEMES) {
    try {
      const key = await derive(plain, salt);
      if (key.length === expected.length && timingSafeEqual(key, expected)) {
        if (name !== CANONICAL) console.log(`[auth] legacy hash scheme matched: ${name}`);
        return { ok: true, legacy: name !== CANONICAL };
      }
    } catch {
      /* try next scheme */
    }
  }
  return { ok: false, legacy: false };
}

export function normalizeAnswer(a: string): string {
  return a.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function verifyAnswer(answer: string, stored: string | null | undefined) {
  const variants = Array.from(new Set([normalizeAnswer(answer), answer.trim(), answer]));
  for (const v of variants) {
    const r = await verifySecret(v, stored);
    if (r.ok) return { ok: true, legacy: r.legacy || v !== normalizeAnswer(answer) };
  }
  return { ok: false, legacy: false };
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

export function keyedHash(value: string): string {
  const secret = process.env.SERVER_SECRET || process.env.DATABASE_URL || 'dabba';
  return createHmac('sha256', secret).update(value).digest('hex');
}

// ---------------------------------------------------------------- sessions
const SESSION_DAYS = 180; // sliding: refreshed daily while the app is used

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(memberId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await sql`INSERT INTO app_sessions (token, member_id) VALUES (${tokenHash(token)}, ${memberId})`;
  // Keep the table tidy: drop this member's long-expired sessions.
  await sql`DELETE FROM app_sessions WHERE member_id = ${memberId} AND created_at < now() - make_interval(days => ${SESSION_DAYS}::int)`;
  return token;
}

export type Me = Row & { id: number; _th: string };

export async function requireMe(req: Request): Promise<Me> {
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!m) fail(401, 'Please sign in again.');
  const th = tokenHash(m[1].toLowerCase());
  const rows = await sql`
    WITH s AS (
      UPDATE app_sessions
         SET created_at = CASE WHEN created_at < now() - interval '1 day' THEN now() ELSE created_at END
       WHERE token = ${th} AND created_at > now() - make_interval(days => ${SESSION_DAYS}::int)
       RETURNING member_id
    )
    UPDATE app_members SET last_seen_at = now()
     WHERE id = (SELECT member_id FROM s)
     RETURNING *`;
  if (!rows.length) fail(401, 'Your session has ended. Please sign in again.');
  return { ...(rows[0] as Row), _th: th } as Me;
}

export function publicMember(a: Row | null | undefined) {
  if (!a || a.id == null) return null;
  return {
    id: a.id as number,
    username: (a.username as string) || null,
    displayName: (a.display_name as string) || 'Dabba user',
    avatarUrl: (a.avatar_url as string) || null,
    about: (a.about as string) || null,
    lastSeenAt: a.last_seen_at ? new Date(a.last_seen_at).toISOString() : null,
    online: a.last_seen_at ? Date.now() - new Date(a.last_seen_at).getTime() < 40_000 : false,
  };
}

export function selfMember(a: Row) {
  return {
    id: a.id as number,
    username: a.username as string,
    displayName: a.display_name as string,
    email: (a.email as string) || null,
    avatarUrl: (a.avatar_url as string) || null,
    about: (a.about as string) || null,
    statusText: (a.status_text as string) || null,
    readReceipts: a.read_receipts !== false,
    hidePreviews: a.hide_previews === true,
    securityQuestion: (a.security_question as string) || null,
    createdAt: a.created_at ? new Date(a.created_at).toISOString() : null,
  };
}

// ---------------------------------------------------------------- rate limits
export async function hit(key: string, windowSec: number): Promise<number> {
  const rows = await sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}::int)
                   THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}::int)
                   THEN now() ELSE rate_limits.window_start END
    RETURNING count`;
  return Number(rows[0]?.count || 0);
}

export async function peek(key: string, windowSec: number): Promise<number> {
  const rows = await sql`SELECT count FROM rate_limits WHERE key = ${key} AND window_start > now() - make_interval(secs => ${windowSec}::int)`;
  return rows.length ? Number(rows[0].count) : 0;
}

export async function clearKey(key: string) {
  await sql`DELETE FROM rate_limits WHERE key = ${key}`;
}

export async function limit(key: string, max: number, windowSec: number, message = 'You are doing that too often. Please wait a moment.') {
  const n = await hit(key, windowSec);
  if (n > max) fail(429, message);
}

// ---------------------------------------------------------------- media
export const MEDIA_URL_RE = /^\/api\/media\/([a-f0-9]{32})$/;

/** Identify a file by its magic bytes. Anything not on the allow-list
 *  (SVG, HTML, scripts, executables...) returns null and is rejected. */
export function sniffMime(b: Buffer): string | null {
  if (b.length < 12) return null;
  const ascii = (s: number, e: number) => b.toString('latin1', s, e);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)/.test(brand)) return 'image/heic';
    return 'audio/mp4'; // m4a / aac-in-mp4 voice notes (Android + iOS + Safari)
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 3) === 'ID3') return 'audio/mpeg';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'audio/aac';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (ascii(0, 6) === '#!AMR\n') return 'audio/amr';
  if (ascii(0, 9) === '#!AMR-WB\n') return 'audio/amr-wb';
  return null;
}

export async function ownedMedia(url: unknown, ownerId: number, kind: 'image' | 'audio') {
  if (typeof url !== 'string') fail(400, 'Missing file.');
  const m = url.match(MEDIA_URL_RE);
  if (!m) fail(400, 'Invalid file reference.');
  const rows = await sql`SELECT id, mime, owner_id FROM chat_media WHERE id = ${m[1]}`;
  if (!rows.length || rows[0].owner_id !== ownerId) fail(400, 'File not found. Please try uploading again.');
  if (!String(rows[0].mime).startsWith(`${kind}/`)) fail(400, `That file is not ${kind === 'image' ? 'an image' : 'audio'}.`);
  return url;
}

export function randomId(bytes = 16) {
  return randomBytes(bytes).toString('hex');
}
