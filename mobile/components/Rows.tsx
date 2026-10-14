import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { C, R } from '@/lib/theme';
import { T, tap } from './ui';

type RowProps = {
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  sublabel?: string | null;
  value?: string | null;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  chevron?: boolean;
  last?: boolean;
};

export function Row({ icon, label, sublabel, value, onPress, danger, right, chevron, last }: RowProps) {
  const color = danger ? C.danger : C.text;
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: C.surfaceAlt } : null]}
    >
      {icon ? (
        <View style={[styles.iconBox, danger && { backgroundColor: C.dangerSoft }]}>
          <Feather name={icon} size={18} color={danger ? C.danger : C.accent} />
        </View>
      ) : null}
      <View style={[styles.body, !last && styles.divider]}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <T w="semibold" style={{ color, fontSize: 16 }}>
            {label}
          </T>
          {sublabel ? <T style={{ color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{sublabel}</T> : null}
        </View>
        {value ? (
          <T numberOfLines={1} style={{ color: C.muted, fontSize: 14, maxWidth: 170, marginRight: 4 }}>
            {value}
          </T>
        ) : null}
        {right}
        {chevron || (onPress && !right && !danger) ? <Feather name="chevron-right" size={20} color={C.faint} /> : null}
      </View>
    </Pressable>
  );
}

export function Group({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.group, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <T w="bold" style={styles.section}>
      {children.toUpperCase()}
    </T>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: C.surface, borderRadius: R.xl, marginHorizontal: 16, overflow: 'hidden', marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, minHeight: 58 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 14, minHeight: 58 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  section: { fontSize: 12.5, color: C.muted, letterSpacing: 0.8, marginHorizontal: 30, marginTop: 8, marginBottom: 8 },
});
