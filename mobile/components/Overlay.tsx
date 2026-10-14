// Global dialogs, bottom sheets, prompts and toasts, driven imperatively:
//   await confirmDialog({...}), actionSheet({...}), promptDialog({...}), toast('...')
import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { C, F, R } from '@/lib/theme';
import { T, tap } from './ui';

type FeatherName = keyof typeof Feather.glyphMap;
export type SheetAction = { label: string; icon?: FeatherName; danger?: boolean; onPress?: () => void; sublabel?: string };

type Req =
  | { id: number; kind: 'dialog'; title: string; message?: string; buttons: Array<{ label: string; style?: 'cancel' | 'danger' | 'primary'; value: unknown }>; resolve: (v: unknown) => void }
  | {
      id: number;
      kind: 'sheet';
      title?: string;
      header?: React.ReactNode;
      quick?: { items: string[]; selected?: string | null; onPick: (v: string) => void };
      actions: SheetAction[];
      resolve: (v: unknown) => void;
    }
  | {
      id: number;
      kind: 'prompt';
      title: string;
      message?: string;
      placeholder?: string;
      initial?: string;
      secure?: boolean;
      confirm: string;
      maxLength?: number;
      multiline?: boolean;
      resolve: (v: unknown) => void;
    }
  | { id: number; kind: 'custom'; render: (close: () => void) => React.ReactNode; resolve: (v: unknown) => void };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

let nextId = 1;
let pushReq: ((r: Req) => void) | null = null;
let pushToast: ((t: string) => void) | null = null;
const queue: Req[] = [];

function open(r: DistributiveOmit<Req, 'id' | 'resolve'>): Promise<unknown> {
  return new Promise((resolve) => {
    const req = { ...r, id: nextId++, resolve } as Req;
    if (pushReq) pushReq(req);
    else queue.push(req);
  });
}

export function confirmDialog(o: { title: string; message?: string; confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return open({
    kind: 'dialog',
    title: o.title,
    message: o.message,
    buttons: [
      { label: o.cancel || 'Cancel', style: 'cancel', value: false },
      { label: o.confirm || 'OK', style: o.danger ? 'danger' : 'primary', value: true },
    ],
  }) as Promise<boolean>;
}

export function alertDialog(title: string, message?: string): Promise<void> {
  return open({ kind: 'dialog', title, message, buttons: [{ label: 'OK', style: 'primary', value: true }] }) as Promise<void>;
}

export function actionSheet(o: {
  title?: string;
  header?: React.ReactNode;
  quick?: { items: string[]; selected?: string | null; onPick: (v: string) => void };
  actions: SheetAction[];
}): Promise<void> {
  return open({ kind: 'sheet', ...o }) as Promise<void>;
}

export function promptDialog(o: {
  title: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  secure?: boolean;
  confirm?: string;
  maxLength?: number;
  multiline?: boolean;
}): Promise<string | null> {
  return open({ kind: 'prompt', confirm: o.confirm || 'Save', ...o }) as Promise<string | null>;
}

export function customSheet(render: (close: () => void) => React.ReactNode): Promise<void> {
  return open({ kind: 'custom', render }) as Promise<void>;
}

export function toast(text: string) {
  pushToast?.(text);
}

function PromptBody({ req, close }: { req: Extract<Req, { kind: 'prompt' }>; close: (v: unknown) => void }) {
  const [value, setValue] = useState(req.initial || '');
  return (
    <View style={styles.dialog}>
      <T w="bold" style={styles.dialogTitle}>
        {req.title}
      </T>
      {req.message ? <T style={styles.dialogMsg}>{req.message}</T> : null}
      <TextInput
        autoFocus
        value={value}
        onChangeText={setValue}
        placeholder={req.placeholder}
        placeholderTextColor={C.faint}
        secureTextEntry={req.secure}
        maxLength={req.maxLength}
        multiline={req.multiline}
        onSubmitEditing={() => !req.multiline && close(value)}
        style={[styles.promptInput, req.multiline && { minHeight: 90, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
      />
      <View style={styles.dialogButtons}>
        <Pressable accessibilityRole="button" onPress={() => close(null)} style={styles.dialogBtn}>
          <T w="bold" style={{ color: C.muted }}>
            Cancel
          </T>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => close(value)} style={styles.dialogBtn}>
          <T w="bold" style={{ color: C.accent }}>
            {req.confirm}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

export function OverlayHost() {
  const insets = useSafeAreaInsets();
  const [stack, setStack] = useState<Req[]>([]);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    pushReq = (r) => setStack((s) => [...s, r]);
    if (queue.length) setStack((s) => [...s, ...queue.splice(0)]);
    pushToast = (t) => {
      setToastText(t);
      clearTimeout(toastTimer.current);
      Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => setToastText(null));
      }, 2400);
    };
    return () => {
      pushReq = null;
      pushToast = null;
    };
  }, [toastAnim]);

  const top = stack[stack.length - 1];
  const close = (value: unknown, after?: () => void) => {
    if (!top) return;
    setStack((s) => s.filter((x) => x.id !== top.id));
    top.resolve(value);
    if (after) setTimeout(after, Platform.OS === 'web' ? 0 : 260);
  };

  return (
    <>
      <Modal visible={!!top} transparent animationType="fade" onRequestClose={() => close(top?.kind === 'prompt' ? null : false)} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => close(top?.kind === 'prompt' ? null : false)} accessibilityLabel="Close" />
          {top?.kind === 'dialog' ? (
            <View style={styles.center} pointerEvents="box-none">
              <View style={styles.dialog} accessibilityRole="alert">
                <T w="bold" style={styles.dialogTitle}>
                  {top.title}
                </T>
                {top.message ? <T style={styles.dialogMsg}>{top.message}</T> : null}
                <View style={styles.dialogButtons}>
                  {top.buttons.map((b) => (
                    <Pressable key={b.label} accessibilityRole="button" onPress={() => close(b.value)} style={styles.dialogBtn}>
                      <T w="bold" style={{ color: b.style === 'danger' ? C.danger : b.style === 'cancel' ? C.muted : C.accent, fontSize: 15.5 }}>
                        {b.label}
                      </T>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ) : null}
          {top?.kind === 'prompt' ? (
            <View style={styles.center} pointerEvents="box-none">
              <PromptBody req={top} close={(v) => close(v)} />
            </View>
          ) : null}
          {top?.kind === 'sheet' ? (
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
              <View style={styles.grabber} />
              {top.header}
              {top.quick ? (
                <View style={styles.quick}>
                  {top.quick.items.map((q) => (
                    <Pressable
                      key={q}
                      accessibilityRole="button"
                      accessibilityLabel={`React ${q}`}
                      onPress={() => {
                        tap();
                        const pick = top.quick!.onPick;
                        close(undefined, () => pick(q));
                      }}
                      style={[styles.quickItem, top.quick!.selected === q && { backgroundColor: C.accentSoft }]}
                    >
                      <T style={{ fontSize: 26 }}>{q}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {top.title ? (
                <T w="bold" style={styles.sheetTitle} numberOfLines={2}>
                  {top.title}
                </T>
              ) : null}
              <ScrollView style={{ maxHeight: 460 }} bounces={false}>
                {top.actions.map((a, i) => (
                  <Pressable
                    key={`${a.label}-${i}`}
                    accessibilityRole="button"
                    onPress={() => {
                      tap();
                      close(undefined, a.onPress);
                    }}
                    style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: C.surfaceAlt }]}
                  >
                    {a.icon ? <Feather name={a.icon} size={20} color={a.danger ? C.danger : C.ink} style={{ width: 28 }} /> : null}
                    <View style={{ flex: 1 }}>
                      <T w="semibold" style={{ fontSize: 16, color: a.danger ? C.danger : C.text }}>
                        {a.label}
                      </T>
                      {a.sublabel ? <T style={{ color: C.muted, fontSize: 13, marginTop: 1 }}>{a.sublabel}</T> : null}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {top?.kind === 'custom' ? (
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
              <View style={styles.grabber} />
              {top.render(() => close(undefined))}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
      {toastText ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            { bottom: insets.bottom + 90, opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
          ]}
          accessibilityLiveRegion="polite"
        >
          <T w="semibold" style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center' }}>
            {toastText}
          </T>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 380, backgroundColor: C.surface, borderRadius: R.xl, padding: 22, paddingBottom: 8 },
  dialogTitle: { fontSize: 18, color: C.ink, marginBottom: 6 },
  dialogMsg: { color: C.muted, lineHeight: 21, marginBottom: 8 },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 8 },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: R.md },
  promptInput: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: F.medium,
    fontSize: 16,
    color: C.text,
    marginTop: 8,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginBottom: 10 },
  quick: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 8, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  quickItem: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 15, color: C.muted, paddingHorizontal: 20, paddingBottom: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 6 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(28,26,23,0.94)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: R.pill,
    maxWidth: '86%',
  },
});
