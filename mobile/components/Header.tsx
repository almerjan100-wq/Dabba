import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C } from '@/lib/theme';
import { T } from './ui';

type Props = {
  title?: string;
  subtitle?: string | null;
  back?: boolean;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onTitlePress?: () => void;
  large?: boolean;
};

export function goBack(fallback = '/chats') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

export function Header({ title, subtitle, back, onBack, left, right, onTitlePress, large }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={[styles.bar, large && { height: 64 }]}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack || (() => goBack())}
            hitSlop={10}
            style={styles.icon}
          >
            <Feather name="chevron-left" size={28} color={C.headerText} />
          </Pressable>
        ) : null}
        {left}
        <Pressable
          disabled={!onTitlePress}
          onPress={onTitlePress}
          style={{ flex: 1, justifyContent: 'center', paddingLeft: back || left ? 4 : 6 }}
          accessibilityRole={onTitlePress ? 'button' : 'header'}
        >
          {title ? (
            <T w={large ? 'extrabold' : 'bold'} numberOfLines={1} style={{ color: C.headerText, fontSize: large ? 26 : 19, letterSpacing: large ? -0.4 : 0 }}>
              {title}
            </T>
          ) : null}
          {subtitle ? (
            <T numberOfLines={1} style={{ color: C.headerMuted, fontSize: 13, marginTop: 1 }}>
              {subtitle}
            </T>
          ) : null}
        </Pressable>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

export function HeaderIcon({ name, onPress, label }: { name: keyof typeof Feather.glyphMap; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={styles.icon}>
      <Feather name={name} size={22} color={C.headerText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: C.header },
  bar: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  right: { flexDirection: 'row', alignItems: 'center' },
});
