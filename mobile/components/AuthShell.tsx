import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { C, R } from '@/lib/theme';
import { Logo } from './Logo';
import { T } from './ui';
import { goBack } from './Header';

export function AuthShell({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  back?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}>
        <LinearGradient colors={[C.heroTop, C.heroMid, C.heroBottom]} style={[styles.hero, { paddingTop: insets.top + 28 }]}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => goBack('/login')} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10}>
              <Feather name="chevron-left" size={28} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Logo size={68} />
          <T w="extrabold" style={styles.brand}>
            Dabba
          </T>
          <T style={styles.tag}>Private chats for your circle.</T>
        </LinearGradient>
        <View style={styles.card}>
          <T w="extrabold" style={styles.title}>
            {title}
          </T>
          {subtitle ? <T style={styles.subtitle}>{subtitle}</T> : null}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 56, paddingHorizontal: 24 },
  back: { position: 'absolute', left: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#FFFFFF', fontSize: 34, marginTop: 14, letterSpacing: -0.6 },
  tag: { color: '#CFC7BA', marginTop: 4, fontSize: 15 },
  card: {
    backgroundColor: C.bg,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
    flexGrow: 1,
  },
  title: { fontSize: 24, color: C.ink, letterSpacing: -0.3 },
  subtitle: { color: C.muted, marginTop: 6, marginBottom: 18, lineHeight: 21 },
});

export const authStyles = StyleSheet.create({
  linkRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: 18 },
  card: { backgroundColor: C.surface, borderRadius: R.xl, padding: 16, marginBottom: 14 },
});
