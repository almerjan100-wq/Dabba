const DAY = 86400000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function timeOf(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function listStamp(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff === 0) return timeOf(iso);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: '2-digit' }) });
}

export function lastSeen(iso: string | null | undefined, online?: boolean) {
  if (online) return 'online';
  if (!iso) return 'tap here for contact info';
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff === 0) return `last seen today at ${timeOf(iso)}`;
  if (diff === 1) return `last seen yesterday at ${timeOf(iso)}`;
  return `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

export function duration(ms?: number | null) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function initials(name?: string | null) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = Array.from(parts[0])[0] || '?';
  const second = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : '';
  return (first + second).toUpperCase();
}

export function previewText(kind: string, body: string | null, deleted?: boolean, durationMs?: number | null) {
  if (deleted) return 'This message was deleted';
  if (kind === 'image') return body ? `📷 ${body}` : '📷 Photo';
  if (kind === 'audio') return `🎤 Voice message${durationMs ? ` (${duration(durationMs)})` : ''}`;
  if (kind === 'call') return callLabel(body, false);
  return body || '';
}

export function callLabel(status: string | null, mineIsCaller: boolean) {
  switch (status) {
    case 'missed':
      return mineIsCaller ? 'No answer' : 'Missed voice call';
    case 'cancelled':
      return mineIsCaller ? 'Cancelled call' : 'Missed voice call';
    case 'declined':
      return mineIsCaller ? 'Call declined' : 'Declined call';
    case 'failed':
      return 'Call failed';
    default:
      return 'Voice call';
  }
}

export const DISAPPEAR_CHOICES = [
  { value: 0, label: 'Off' },
  { value: 86400, label: '24 hours' },
  { value: 604800, label: '7 days' },
  { value: 7776000, label: '90 days' },
];

export function disappearLabel(sec?: number | null) {
  return DISAPPEAR_CHOICES.find((c) => c.value === (sec || 0))?.label || 'Off';
}
