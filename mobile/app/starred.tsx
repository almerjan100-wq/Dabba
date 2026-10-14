import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, errorText, Message } from '@/lib/api';
import { listStamp, previewText } from '@/lib/format';
import { useAuth } from '@/lib/session';
import { isChatLocked } from '@/lib/appLock';
import { C } from '@/lib/theme';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { actionSheet, toast } from '@/components/Overlay';
import { Empty, T } from '@/components/ui';

export default function Starred() {
  const { me } = useAuth();
  const [list, setList] = useState<Message[] | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Message[] }>('/messages/starred');
      setList(r.messages);
    } catch (e) {
      toast(errorText(e));
      setList([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const unstar = async (m: Message) => {
    setList((l) => (l || []).filter((x) => x.id !== m.id));
    await api(`/messages/${m.id}/star`, { body: { starred: false } }).catch((e) => toast(errorText(e)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title="Starred messages" />
      {list === null ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(m) => String(m.id)}
          ListEmptyComponent={<Empty icon="star" title="No starred messages" text="Long-press any message and tap Star to keep it here." />}
          renderItem={({ item }) => {
            const hidden = isChatLocked(item.conversationId);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/chat/${item.conversationId}`)}
                onLongPress={() => actionSheet({ actions: [{ label: 'Unstar', icon: 'star', onPress: () => unstar(item) }] })}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceAlt }]}
              >
                <Avatar name={item.senderName} url={item.senderAvatar} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T w="bold" numberOfLines={1} style={{ flex: 1 }}>
                      {item.senderId === me?.id ? 'You' : item.senderName} › {item.chatName}
                    </T>
                    <T style={{ color: C.muted, fontSize: 12.5 }}>{listStamp(item.createdAt)}</T>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Ionicons name="star" size={12} color={C.gold} />
                    <T numberOfLines={2} style={{ color: C.text, flex: 1 }}>
                      {hidden ? 'Message in a locked chat' : previewText(item.kind, item.body, !!item.deletedAt, item.durationMs)}
                    </T>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
});
