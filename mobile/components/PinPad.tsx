import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, R } from '@/lib/theme';
import {
  bioAvailable,
  formatWait,
  setAppPin,
  setChatPin,
  verifyAppPin,
  verifyChatPin,
  VerifyResult,
} from '@/lib/appLock';
import { T, tap } from './ui';

const MIN = 4;
const MAX = 6;

// ------------------------------------------------------------------ keypad
type PadProps = {
  onSubmit: (pin: string) => Promise<string | null>; // returns an error message, or null on success
  bio?: boolean;
  onBio?: () => void;
  submitLabel?: string;
  resetKey?: string | number;
};

export function PinPad({ onSubmit, bio, onBio, submitLabel = 'Unlock', resetKey }: PadProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setPin('');
    setError(null);
  }, [resetKey]);

  const doShake = () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Animated.sequence(
      [12, -12, 9, -9, 5, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: Platform.OS !== 'web' })),
    ).start();
  };

  const submit = async (value: string) => {
    if (busy || value.length < MIN) return;
    setBusy(true);
    const err = await onSubmit(value);
    setBusy(false);
    if (err) {
      setError(err);
      setPin('');
      doShake();
    }
  };

  const press = (d: string) => {
    if (busy) return;
    tap();
    setError(null);
    setPin((p) => {
      if (p.length >= MAX) return p;
      const next = p + d;
      if (next.length === MAX) setTimeout(() => submit(next), 60);
      return next;
    });
  };

  const slots = Math.max(MIN, Math.min(MAX, pin.length + (pin.length < MAX ? 1 : 0)));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]} accessibilityLabel={`${pin.length} digits entered`}>
        {Array.from({ length: slots }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />
        ))}
      </Animated.View>
      <T w="medium" style={[styles.error, !error && { opacity: 0 }]} accessibilityLiveRegion="polite">
        {error || ' '}
      </T>
      <View style={styles.grid}>
        {keys.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} />
        ))}
        {bio && onBio ? (
          <Key icon={<Ionicons name="finger-print" size={30} color={C.gold} />} label="Use fingerprint" onPress={onBio} />
        ) : (
          <View style={styles.key} />
        )}
        <Key label="0" onPress={() => press('0')} />
        <Key
          icon={<Feather name="delete" size={24} color="#EDE6DA" />}
          label="Delete"
          onPress={() => {
            tap();
            setPin((p) => p.slice(0, -1));
          }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={pin.length < MIN || busy}
        onPress={() => submit(pin)}
        style={[styles.submit, (pin.length < MIN || busy) && { opacity: 0.35 }]}
      >
        <T w="bold" style={{ color: C.ink, fontSize: 16 }}>
          {busy ? 'Checking…' : submitLabel}
        </T>
      </Pressable>
    </View>
  );
}

function Key({ label, onPress, icon }: { label: string; onPress: () => void; icon?: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.key, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}
    >
      {icon || (
        <T w="semibold" style={{ color: '#FFFFFF', fontSize: 28 }}>
          {label}
        </T>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------ full screen
type ScreenProps = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
  onClose?: () => void;
  footer?: React.ReactNode;
} & PadProps;

export function PinScreen({ title, subtitle, icon = 'lock', onClose, footer, ...pad }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={[C.heroTop, C.heroMid, C.heroBottom]} style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[styles.close, { top: insets.top + 10 }]} hitSlop={10}>
          <Feather name="x" size={24} color="#EDE6DA" />
        </Pressable>
      ) : null}
      <View style={{ alignItems: 'center', marginTop: 28, marginBottom: 18, paddingHorizontal: 24 }}>
        <View style={styles.badge}>
          <Feather name={icon} size={26} color={C.ink} />
        </View>
        <T w="extrabold" style={{ color: '#FFFFFF', fontSize: 22, textAlign: 'center' }}>
          {title}
        </T>
        {subtitle ? <T style={{ color: '#CFC7BA', marginTop: 6, textAlign: 'center', lineHeight: 20 }}>{subtitle}</T> : null}
      </View>
      <PinPad {...pad} />
      <View style={{ flex: 1 }} />
      {footer}
    </LinearGradient>
  );
}

// ------------------------------------------------------------------ flows
export type LockTarget = { kind: 'app' } | { kind: 'chat'; id: number; name?: string };
type Mode = 'create' | 'change' | 'verify';

function failMessage(r: VerifyResult) {
  if (r.ok) return null;
  if (r.waitMs > 0) return `Too many tries. Wait ${formatWait(r.waitMs)}.`;
  return `Wrong code. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`;
}

export function PinModal({
  visible,
  target,
  mode,
  onDone,
}: {
  visible: boolean;
  target: LockTarget;
  mode: Mode;
  onDone: (ok: boolean) => void;
}) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm' | 'verify'>('new');
  const [first, setFirst] = useState('');
  const [bio, setBio] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(mode === 'change' ? 'current' : mode === 'verify' ? 'verify' : 'new');
      setFirst('');
    }
  }, [visible, mode]);
  useEffect(() => {
    bioAvailable().then(setBio);
  }, []);

  const what = target.kind === 'app' ? 'app PIN' : 'chat code';
  const verify = (pin: string) => (target.kind === 'app' ? verifyAppPin(pin) : verifyChatPin(target.id, pin));

  const titles: Record<string, [string, string]> = {
    current: [`Enter current ${what}`, 'Confirm it’s you before changing it.'],
    new: [
      target.kind === 'app' ? 'Create an app PIN' : `Create a code${target.name ? ` for ${target.name}` : ''}`,
      target.kind === 'app' ? 'You’ll enter this whenever Dabba opens. 4–6 digits.' : 'Only this chat uses this code. 4–6 digits.',
    ],
    confirm: ['Confirm the code', 'Enter the same digits again.'],
    verify: [`Enter ${what}`, ''],
  };
  const [title, subtitle] = titles[step];

  const onSubmit = async (pin: string): Promise<string | null> => {
    if (step === 'current' || step === 'verify') {
      const r = await verify(pin);
      if (!r.ok) return failMessage(r);
      if (step === 'verify') {
        onDone(true);
        return null;
      }
      setStep('new');
      return null;
    }
    if (step === 'new') {
      setFirst(pin);
      setStep('confirm');
      return null;
    }
    if (pin !== first) {
      setStep('new');
      setFirst('');
      return "Codes didn't match. Start again.";
    }
    if (target.kind === 'app') await setAppPin(pin);
    else await setChatPin(target.id, pin);
    onDone(true);
    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onDone(false)} statusBarTranslucent>
      <PinScreen
        title={title}
        subtitle={subtitle}
        icon={step === 'confirm' ? 'check-circle' : 'lock'}
        onClose={() => onDone(false)}
        onSubmit={onSubmit}
        submitLabel={step === 'new' ? 'Next' : step === 'confirm' ? 'Save code' : 'Continue'}
        resetKey={step}
        bio={false && bio}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  close: { position: 'absolute', left: 16, zIndex: 2, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  dots: { flexDirection: 'row', gap: 16, height: 22, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#CFC7BA' },
  dotOn: { backgroundColor: C.gold, borderColor: C.gold },
  error: { color: '#FFB4A9', marginTop: 12, minHeight: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 282, justifyContent: 'space-between', marginTop: 12 },
  key: { width: 82, height: 72, borderRadius: R.xl, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  submit: {
    marginTop: 8,
    backgroundColor: C.gold,
    paddingHorizontal: 34,
    paddingVertical: 13,
    borderRadius: R.pill,
  },
});
