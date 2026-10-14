import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F, R } from '@/lib/theme';

type Weight = keyof typeof F;

export function T({ w = 'regular', style, ...props }: TextProps & { w?: Weight }) {
  return <Text {...props} style={[{ fontFamily: F[w], color: C.text, fontSize: 15 }, style]} />;
}

export function tap(kind: 'light' | 'medium' | 'select' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'select') Haptics.selectionAsync();
    else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* no haptics */
  }
}

type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Btn({ title, onPress, variant = 'primary', loading, disabled, icon, style, small }: BtnProps) {
  const palette = {
    primary: { bg: C.accent, fg: '#FFFFFF', border: C.accent },
    dark: { bg: C.ink, fg: '#FFFFFF', border: C.ink },
    secondary: { bg: C.surface, fg: C.text, border: C.line },
    ghost: { bg: 'transparent', fg: C.accent, border: 'transparent' },
    danger: { bg: C.surface, fg: C.danger, border: '#F1C9C4' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={() => {
        if (off) return;
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon ? <Feather name={icon} size={small ? 15 : 18} color={palette.fg} /> : null}
          <T w="bold" style={{ color: palette.fg, fontSize: small ? 14 : 16 }}>
            {title}
          </T>
        </View>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label?: string;
  icon?: keyof typeof Feather.glyphMap;
  secure?: boolean;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function Field({ label, icon, secure, hint, containerStyle, inputStyle, ...props }: FieldProps) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ marginBottom: 14 }, containerStyle]}>
      {label ? (
        <T w="semibold" style={styles.label}>
          {label}
        </T>
      ) : null}
      <View style={[styles.field, focused && { borderColor: C.accent }]}>
        {icon ? <Feather name={icon} size={18} color={C.muted} style={{ marginRight: 10 }} /> : null}
        <TextInput
          placeholderTextColor={C.faint}
          {...props}
          secureTextEntry={secure ? hidden : props.secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object), inputStyle]}
        />
        {secure ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Feather name={hidden ? 'eye' : 'eye-off'} size={18} color={C.muted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <T style={styles.hint}>{hint}</T> : null}
    </View>
  );
}

export function ErrorNote({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Feather name="alert-circle" size={16} color={C.danger} style={{ marginTop: 2 }} />
      <T style={{ color: C.danger, flex: 1, fontSize: 14 }}>{text}</T>
    </View>
  );
}

export function Toggle({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        tap('select');
        onValueChange(v);
      }}
      trackColor={{ false: '#D5CEC3', true: C.accent }}
      thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : {})}
    />
  );
}

export function Chip({ label, active, onPress, count }: { label: string; active?: boolean; onPress?: () => void; count?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        tap('select');
        onPress?.();
      }}
      style={[styles.chip, active ? { backgroundColor: C.accent, borderColor: C.accent } : null]}
    >
      <T w="semibold" style={{ fontSize: 14, color: active ? '#FFFFFF' : C.text }}>
        {label}
        {count ? ` ${count}` : ''}
      </T>
    </Pressable>
  );
}

export function Empty({ icon, title, text, children }: { icon: keyof typeof Feather.glyphMap; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={26} color={C.accent} />
      </View>
      <T w="bold" style={{ fontSize: 17, textAlign: 'center', color: C.ink }}>
        {title}
      </T>
      {text ? <T style={{ color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 21 }}>{text}</T> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 50,
    borderRadius: R.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  btnSmall: { minHeight: 38, borderRadius: R.md, paddingHorizontal: 14 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, color: C.muted, marginBottom: 6, letterSpacing: 0.2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontFamily: F.medium, fontSize: 16, color: C.text, paddingVertical: 12 },
  hint: { fontSize: 13, color: C.muted, marginTop: 6 },
  error: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: C.dangerSoft,
    borderRadius: R.md,
    padding: 12,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: R.pill,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.surfaceAlt,
  },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
});
