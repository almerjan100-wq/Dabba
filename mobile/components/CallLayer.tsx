import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api, Call } from '@/lib/api';
import { acceptCall, getCallState, hangUp, receiveIncoming, toggleMute, useCallState } from '@/lib/calls';
import { usePolling } from '@/lib/hooks';
import { duration } from '@/lib/format';
import { useAuth } from '@/lib/session';
import { C } from '@/lib/theme';
import { Avatar } from './Avatar';
import { T, tap } from './ui';

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <T w="semibold" style={styles.status}>
      {duration(now - since)}
    </T>
  );
}

function RoundBtn({ icon, label, color, onPress, active }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void; active?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          tap('medium');
          onPress();
        }}
        style={({ pressed }) => [styles.round, { backgroundColor: color }, active && { borderWidth: 2, borderColor: '#FFFFFF' }, pressed && { opacity: 0.85 }]}
      >
        <Feather name={icon} size={28} color="#FFFFFF" />
      </Pressable>
      <T w="medium" style={{ color: '#E6DED1', fontSize: 13 }}>
        {label}
      </T>
    </View>
  );
}

export function CallLayer() {
  const { me } = useAuth();
  const s = useCallState();
  const insets = useSafeAreaInsets();

  // Watch for incoming calls while signed in and not already on a call.
  usePolling(
    async () => {
      if (getCallState().phase !== 'idle') return;
      const r = await api<{ call: Call | null }>('/calls/incoming');
      if (r.call && getCallState().phase === 'idle') receiveIncoming(r.call);
    },
    3000,
    !!me,
  );

  if (s.phase === 'idle') return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 900, elevation: 900 }]}>
      <LinearGradient colors={[C.heroTop, C.heroMid, C.heroBottom]} style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        <View style={{ alignItems: 'center' }}>
          <T w="medium" style={{ color: '#CFC7BA', letterSpacing: 1, fontSize: 12.5 }}>
            DABBA VOICE CALL
          </T>
          <View style={{ marginTop: 34, marginBottom: 18 }}>
            <Avatar name={s.peerName} url={s.peerAvatar} size={128} ring />
          </View>
          <T w="extrabold" style={{ color: '#FFFFFF', fontSize: 28, textAlign: 'center' }} numberOfLines={1}>
            {s.peerName}
          </T>
          {s.phase === 'active' && s.connectedAt ? (
            <Timer since={s.connectedAt} />
          ) : (
            <T w="semibold" style={styles.status} accessibilityLiveRegion="polite">
              {s.note || ''}
            </T>
          )}
        </View>
        <View style={{ flex: 1 }} />
        {s.phase === 'incoming' ? (
          <View style={styles.row}>
            <RoundBtn icon="phone-off" label="Decline" color="#C0352B" onPress={() => hangUp()} />
            <RoundBtn icon="phone" label="Accept" color="#2E9E5B" onPress={acceptCall} />
          </View>
        ) : s.phase === 'ended' ? null : (
          <View style={styles.row}>
            <RoundBtn icon={s.muted ? 'mic-off' : 'mic'} label={s.muted ? 'Unmute' : 'Mute'} color={s.muted ? C.accent : 'rgba(255,255,255,0.16)'} onPress={toggleMute} active={s.muted} />
            <RoundBtn icon="phone-off" label="End" color="#C0352B" onPress={() => hangUp()} />
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  status: { color: '#E6DED1', fontSize: 16, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', width: '100%', maxWidth: 360 },
  round: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
