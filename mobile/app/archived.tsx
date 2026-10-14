import React, { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/session';
import { refreshConversations, useConversations } from '@/lib/store';
import { lockedChatIds, useLockState } from '@/lib/appLock';
import { C } from '@/lib/theme';
import { Header } from '@/components/Header';
import { ChatRow } from '@/components/ChatRow';
import { chatLongPress } from '@/components/chatActions';
import { Empty, T } from '@/components/ui';

export default function Archived() {
  useLockState();
  const { me } = useAuth();
  const { conversations } = useConversations();
  useEffect(() => {
    refreshConversations().catch(() => {});
  }, []);
  if (!me) return null;
  const locked = new Set(lockedChatIds());
  const list = conversations.filter((c) => c.archived && !locked.has(c.id));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title="Archived" />
      <FlatList
        data={list}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={
          list.length ? <T style={{ color: C.muted, textAlign: 'center', padding: 14, fontSize: 13 }}>Archived chats stay here even when new messages arrive. Long-press to unarchive.</T> : null
        }
        ListEmptyComponent={<Empty icon="archive" title="No archived chats" text="Long-press a chat in your list and choose Archive." />}
        renderItem={({ item }) => <ChatRow c={item} meId={me.id} onPress={() => router.push(`/chat/${item.id}`)} onLongPress={() => chatLongPress(item)} />}
      />
    </View>
  );
}
