import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '@/lib/session';
import {
  bioAvailable,
  bioPrompt,
  formatWait,
  getAppBio,
  getChatBio,
  hasAppPin,
  isAppUnlocked,
  isChatLocked,
  isChatUnlocked,
  markAppUnlocked,
  markChatUnlocked,
  relockAll,
  relockChats,
  useLockState,
  verifyAppPin,
  verifyChatPin,
  VerifyResult,
} from '@/lib/appLock';
import { PinScreen } from './PinPad';
import { T } from './ui';
import { goBack } from './Header';

export const AWAY_LOCK_MS = 15_000;

function failMessage(r: VerifyResult) {
  if (r.ok) return null;
  if (r.waitMs > 0) return `Too many tries. Wait ${formatWait(r.waitMs)}.`;
  return `Wrong code. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`;
}

/** Watches the app going to the background: chats relock right away,
 *  the whole app relocks after being away for AWAY_LOCK_MS. */
export function useAwayLock() {
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    const onHide = () => {
      awaySince.current = Date.now();
      relockChats();
    };
    const onShow = () => {
      if (awaySince.current && Date.now() - awaySince.current >= AWAY_LOCK_MS) relockAll();
      awaySince.current = null;
    };
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const fn = () => (document.visibilityState === 'hidden' ? onHide() : onShow());
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') onHide();
      else if (s === 'active') onShow();
    });
    return () => sub.remove();
  }, []);
}

function ForgotFooter({ label }: { label: string }) {
  const { signOut } = useAuth();
  const [armed, setArmed] = useState(false);
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 30 }}>
      {armed ? (
        <T style={{ color: '#CFC7BA', textAlign: 'center', marginBottom: 8, fontSize: 13, lineHeight: 18 }}>
          Logging out removes every lock code on this device. Your chats stay safe on your account.
        </T>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => (armed ? signOut({ remote: true, wipeLocks: true }) : setArmed(true))}
        hitSlop={10}
        style={{ padding: 10 }}
      >
        <T w="bold" style={{ color: armed ? '#FFB4A9' : '#D8A24A' }}>
          {armed ? 'Tap again to log out' : label}
        </T>
      </Pressable>
    </View>
  );
}

export function AppLockOverlay() {
  useLockState();
  useAwayLock();
  const { me } = useAuth();
  const [bio, setBio] = useState(false);
  const locked = !!me && hasAppPin() && !isAppUnlocked();
  const prompted = useRef(false);

  const tryBio = useCallback(async () => {
    if (await bioPrompt('Unlock Dabba')) markAppUnlocked();
  }, []);

  useEffect(() => {
    if (!locked) {
      prompted.current = false;
      return;
    }
    (async () => {
      const ok = getAppBio() && (await bioAvailable());
      setBio(ok);
      if (ok && !prompted.current) {
        prompted.current = true;
        tryBio();
      }
    })();
  }, [locked, tryBio]);

  if (!locked) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}>
      <PinScreen
        title="Dabba is locked"
        subtitle="Enter your app PIN to continue."
        onSubmit={async (pin) => failMessage(await verifyAppPin(pin))}
        bio={bio}
        onBio={tryBio}
        footer={<ForgotFooter label="Forgot PIN? Log out" />}
      />
    </View>
  );
}

export function ChatLockGate({ chatId, chatName, children }: { chatId: number; chatName?: string; children: React.ReactNode }) {
  useLockState();
  const [bio, setBio] = useState(false);
  const locked = isChatLocked(chatId) && !isChatUnlocked(chatId);
  const prompted = useRef(false);

  const tryBio = useCallback(async () => {
    if (await bioPrompt(`Unlock ${chatName || 'this chat'}`)) markChatUnlocked(chatId);
  }, [chatId, chatName]);

  useEffect(() => {
    if (!locked) {
      prompted.current = false;
      return;
    }
    (async () => {
      const ok = getChatBio(chatId) && (await bioAvailable());
      setBio(ok);
      if (ok && !prompted.current) {
        prompted.current = true;
        tryBio();
      }
    })();
  }, [locked, chatId, tryBio]);

  if (!locked) return <>{children}</>;
  return (
    <PinScreen
      title={chatName ? `${chatName} is locked` : 'This chat is locked'}
      subtitle="Enter this chat’s code to open it."
      onSubmit={async (pin) => failMessage(await verifyChatPin(chatId, pin))}
      onClose={() => goBack()}
      bio={bio}
      onBio={tryBio}
      footer={<ForgotFooter label="Forgot the code? Log out" />}
    />
  );
}
