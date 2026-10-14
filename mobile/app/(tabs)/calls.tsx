import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { api, Call, errorText } from '@/lib/api';
import { startCall } from '@/lib/calls';
import { usePolling } from '@/lib/hooks';
import { duration, listStamp, timeOf } from '@/lib/format';
import { C } from '@/lib/theme';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Overlay';
import { Empty, T } from '@/components/ui';

function label(c: Call) {
  const missed = c.direction === 'incoming' && (c.status === 'missed' || c.status === 'cancelled');
  if (missed) return { text: 'Missed', color: C.danger, icon: 'phone-missed' as const };
  if (c.status === 'declined') return { text: c.direction === 'outgoing' ? 'Declined' : 'You declined', color: C.muted, icon: 'phone-off' as const };
  if (c.direction === 'outgoing' && (c.status === 'missed' || c.status === 'cancelled')) return { text: 'Not answered', color: C.muted, icon: 'phone-outgoing' as const };
  if (c.status === 'failed') return { text: 'Failed', color: C.danger, icon: 'alert-circle' as const };
  return {
    text: c.durationSec ? duration(c.durationSec * 1000) : c.direction === 'outgoing' ? 'Outgoing' : 'Incoming',
    color: C.muted,
    icon: c.direction === 'outgoing' ? ('phone-outgoing' as const) : ('phone-incoming' as const),
  };
}

export default function Calls() {
  const focused = useIsFocused();
  const [calls, setCalls] = useState<Call[] | null>(null);
  usePolling(
    async () => {
      const r = await api<{ calls: Call[] }>('/calls');
      setCalls(r.calls);
    },
    8000,
    focused,
  );

  const callBack = async (c: Call) => {
    try {
      await startCall(c.conversationId, { name: c.peer?.displayName || 'Dabba user', avatarUrl: c.peer?.avatarUrl || null });
    } catch (e) {
      toast(errorText(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header large title="Calls" />
      {calls === null ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          ListHeaderComponent={
            calls.length ? (
              <T w="bold" style={styles.section}>
                RECENT
              </T>
            ) : null
          }
          ListEmptyComponent={<Empty icon="phone" title="No calls yet" text="Open a chat with a friend and tap the phone icon to start a voice call." />}
          renderItem={({ item }) => {
            const l = label(item);
            const name = item.peer?.displayName || 'Dabba user';
            return (
              <View style={styles.row}>
                <Avatar name={name} url={item.peer?.avatarUrl} size={48} />
                <View style={{ flex: 1 }}>
                  <T w="bold" numberOfLines={1} style={{ fontSize: 16, color: l.color === C.danger ? C.danger : C.ink }}>
                    {name}
                  </T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Feather name={l.icon} size={14} color={l.color} />
                    <T style={{ color: C.muted, fontSize: 13.5 }}>
                      {l.text} · {listStamp(item.createdAt) === timeOf(item.createdAt) ? `Today, ${timeOf(item.createdAt)}` : `${listStamp(item.createdAt)}, ${timeOf(item.createdAt)}`}
                    </T>
                  </View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Call ${name}`} onPress={() => callBack(item)} hitSlop={8} style={styles.callBtn}>
                  <Feather name="phone" size={20} color={C.accent} />
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12.5, color: C.muted, letterSpacing: 0.8, marginHorizontal: 18, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  callBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft },
});
