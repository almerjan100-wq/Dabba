import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/lib/session';
import { refreshConversations, useConversations } from '@/lib/store';
import { lockedChatIds, useLockState } from '@/lib/appLock';
import { usePolling } from '@/lib/hooks';
import { C, F, R, shadow } from '@/lib/theme';
import { Header, HeaderIcon } from '@/components/Header';
import { ChatRow } from '@/components/ChatRow';
import { chatLongPress } from '@/components/chatActions';
import { actionSheet } from '@/components/Overlay';
import { Chip, Empty, T, tap } from '@/components/ui';

type Filter = 'all' | 'unread' | 'favourites' | 'groups';

export default function Chats() {
  const { me } = useAuth();
  const { conversations, loaded } = useConversations();
  useLockState();
  const focused = useIsFocused();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  usePolling(
    async () => {
      try {
        await refreshConversations();
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    4000,
    focused && !!me,
  );

  const locked = useMemo(() => new Set(lockedChatIds()), [conversations]); // eslint-disable-line react-hooks/exhaustive-deps
  const main = conversations.filter((c) => !c.archived && !locked.has(c.id));
  const archivedCount = conversations.filter((c) => c.archived && !locked.has(c.id)).length;
  const lockedCount = conversations.filter((c) => locked.has(c.id)).length;
  const unreadCount = main.filter((c) => c.unread > 0).length;

  const needle = q.trim().toLowerCase();
  const list = main.filter((c) => {
    if (filter === 'unread' && !c.unread) return false;
    if (filter === 'favourites' && !c.favorite) return false;
    if (filter === 'groups' && c.type !== 'group') return false;
    if (!needle) return true;
    return (
      c.name.toLowerCase().includes(needle) ||
      (c.other?.username || '').toLowerCase().includes(needle) ||
      (c.lastMessage?.kind === 'text' && (c.lastMessage.body || '').toLowerCase().includes(needle))
    );
  });

  const menu = () =>
    actionSheet({
      actions: [
        { label: 'New group', icon: 'users', onPress: () => router.push('/new-group') },
        { label: 'Friends & requests', icon: 'user-plus', onPress: () => router.push('/friends') },
        { label: 'Starred messages', icon: 'star', onPress: () => router.push('/starred') },
        { label: 'Archived chats', icon: 'archive', onPress: () => router.push('/archived') },
        { label: 'Settings', icon: 'settings', onPress: () => router.push('/settings') },
      ],
    });

  if (!me) return null;

  const header = (
    <View>
      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color={C.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search chats"
          placeholderTextColor={C.faint}
          style={[styles.search, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
          accessibilityLabel="Search chats"
          returnKeyType="search"
        />
        {q ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => setQ('')} hitSlop={10}>
            <Feather name="x-circle" size={17} color={C.faint} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Unread" count={unreadCount || undefined} active={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label="Favourites" active={filter === 'favourites'} onPress={() => setFilter('favourites')} />
        <Chip label="Groups" active={filter === 'groups'} onPress={() => setFilter('groups')} />
      </ScrollView>
      {lockedCount && filter === 'all' && !needle ? (
        <FolderRow icon="lock" label="Locked chats" count={lockedCount} onPress={() => router.push('/locked')} />
      ) : null}
      {archivedCount && filter === 'all' && !needle ? (
        <FolderRow icon="archive" label="Archived" count={archivedCount} onPress={() => router.push('/archived')} />
      ) : null}
      {error ? (
        <View style={styles.offline}>
          <Feather name="wifi-off" size={14} color={C.warnText} />
          <T style={{ color: C.warnText, fontSize: 13, flex: 1 }}>{error}</T>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header
        large
        title="Dabba"
        right={
          <>
            <HeaderIcon name="user-plus" label="Friends and requests" onPress={() => router.push('/friends')} />
            <HeaderIcon name="more-vertical" label="More options" onPress={menu} />
          </>
        }
      />
      <FlatList
        data={list}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ChatRow c={item} meId={me.id} onPress={() => router.push(`/chat/${item.id}`)} onLongPress={() => chatLongPress(item)} />
        )}
        ListEmptyComponent={
          !loaded ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
          ) : needle || filter !== 'all' ? (
            <Empty icon="search" title="Nothing here" text={needle ? `No chats match “${q.trim()}”.` : 'No chats in this filter yet.'} />
          ) : (
            <Empty icon="message-circle" title="No chats yet" text="Add friends by their username, then start a chat or a group." />
          )
        }
        contentContainerStyle={{ paddingBottom: 110 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New chat"
        onPress={() => {
          tap('medium');
          router.push('/new-chat');
        }}
        style={({ pressed }) => [styles.fab, shadow, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Feather name="edit" size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function FolderRow({ icon, label, count, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; count: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.folder, pressed && { backgroundColor: C.surfaceAlt }]}>
      <View style={styles.folderIcon}>
        <Feather name={icon} size={18} color={C.accent} />
      </View>
      <T w="bold" style={{ flex: 1, fontSize: 16, color: C.ink }}>
        {label}
      </T>
      <T w="semibold" style={{ color: C.muted }}>
        {count}
      </T>
      <Feather name="chevron-right" size={18} color={C.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: R.pill,
    paddingHorizontal: 16,
    height: 46,
    borderWidth: 1,
    borderColor: C.line,
  },
  search: { flex: 1, fontFamily: F.medium, fontSize: 15.5, color: C.text, height: 44 },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  folderIcon: { width: 52, height: 40, alignItems: 'center', justifyContent: 'center' },
  offline: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: C.warnBg,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: R.md,
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
