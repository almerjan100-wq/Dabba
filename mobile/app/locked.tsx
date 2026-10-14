import React, { useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/session';
import { refreshConversations, useConversations } from '@/lib/store';
import { lockedChatIds, useLockState } from '@/lib/appLock';
import { C, R } from '@/lib/theme';
import { Header } from '@/components/Header';
import { ChatRow } from '@/components/ChatRow';
import { Empty, T } from '@/components/ui';

export default function Locked() {
  useLockState();
  const { me } = useAuth();
  const { conversations } = useConversations();
  useEffect(() => {
    refreshConversations().catch(() => {});
  }, []);
  if (!me) return null;
  const ids = new Set(lockedChatIds());
  const list = conversations.filter((c) => ids.has(c.id));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title="Locked chats" />
      <FlatList
        data={list}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={
          <View style={styles.note}>
            <Feather name="lock" size={16} color={C.accent} style={{ marginTop: 2 }} />
            <T style={{ flex: 1, color: C.text, lineHeight: 20, fontSize: 13.5 }}>
              Each locked chat has its own code — separate from your app PIN. Their messages are hidden from your chat list and alerts.
            </T>
          </View>
        }
        ListEmptyComponent={<Empty icon="lock" title="No locked chats" text="Open a chat’s info and turn on “Lock this chat” to give it its own code." />}
        renderItem={({ item }) => <ChatRow c={item} meId={me.id} locked onPress={() => router.push(`/chat/${item.id}`)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: 10, backgroundColor: C.goldSoft, margin: 16, padding: 14, borderRadius: R.lg },
});
