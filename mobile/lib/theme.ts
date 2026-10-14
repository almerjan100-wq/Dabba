import { Platform, ViewStyle } from 'react-native';

// Dabba palette: warm graphite + amber. All text pairings checked for
// WCAG AA contrast against the surfaces they sit on.
export const C = {
  bg: '#F4F1EC',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEAE2',
  sunken: '#E8E2D8',
  line: '#E2DBD0',
  ink: '#1C1A17',
  text: '#26221E',
  muted: '#655E55',
  faint: '#8A8277',

  accent: '#9E5819',
  accentDark: '#7E4512',
  accentSoft: '#F3E6D6',
  gold: '#D8A24A',
  goldSoft: '#F6EAD2',

  header: '#1C1A17',
  headerText: '#FFFFFF',
  headerMuted: '#CFC7BA',

  heroTop: '#2E2822',
  heroMid: '#1C1A17',
  heroBottom: '#131210',

  bubbleMine: '#2A2622',
  bubbleMineText: '#F7F3EC',
  bubbleMineMeta: '#BFB6A8',
  bubbleTheirs: '#FFFFFF',
  bubbleTheirsText: '#26221E',
  bubbleTheirsMeta: '#6F675D',
  readTick: '#7CC4FF',

  chip: '#EADFCB',
  chipText: '#4F4130',

  danger: '#B42318',
  dangerSoft: '#FDECEA',
  success: '#2E7D32',
  online: '#2E9E5B',
  warnBg: '#FFF4E5',
  warnText: '#7A4A00',
  overlay: 'rgba(12, 11, 10, 0.55)',
};

export const F = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const shadow: ViewStyle =
  Platform.OS === 'web'
    ? ({ boxShadow: '0 1px 3px rgba(28,26,23,0.10)' } as ViewStyle)
    : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 };

export const WALLPAPERS: Array<{ key: string; color: string; label: string }> = [
  { key: 'linen', color: '#F4F1EC', label: 'Linen' },
  { key: 'sand', color: '#EADFCB', label: 'Sand' },
  { key: 'sage', color: '#DCE5D6', label: 'Sage' },
  { key: 'mist', color: '#DCE4EC', label: 'Mist' },
  { key: 'blush', color: '#F1DFDA', label: 'Blush' },
  { key: 'stone', color: '#E2DED8', label: 'Stone' },
];

export function wallpaperColor(key?: string | null) {
  return WALLPAPERS.find((w) => w.key === key)?.color || C.bg;
}

const AVATAR_COLORS = ['#9E5819', '#6B4E2E', '#3E5C58', '#5B4A6E', '#8A3B3B', '#2F5D7C', '#4F6230', '#7A4F63'];
export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export const SENDER_COLORS = ['#9E5819', '#2F5D7C', '#7A4F63', '#3E6B4B', '#8A3B3B', '#5B4A6E'];
export function senderColor(id: number) {
  return SENDER_COLORS[Math.abs(id) % SENDER_COLORS.length];
}
