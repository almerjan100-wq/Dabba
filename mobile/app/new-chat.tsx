import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api, errorText } from '@/lib/api';
import { openDirectChat, useFriends } from '@/lib/friends';
import { useAuth } from '@/lib/session';
import { C, F, R } from '@/lib/theme';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Overlay';
import { Empty, T } from '@/components/ui';

export default function NewChat() {
  const { me } = useAuth();
  const { data } = useFriends();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const open = async (memberId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      router.replace(`/chat/${await openDirectChat(memberId)}`);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const openSelf = async () => {
    try {
      const r = await api<{ id: number }>('/conversations/self', { body: {} });
      router.replace(`/chat/${r.id}`);
    } catch (e) {
      toast(errorText(e));
    }
  };

  const needle = q.trim().toLowerCase();
  const friends = (data?.friends || []).filter((f) => !needle || f.displayName.toLowerCase().includes(needle) || (f.username || '').includes(needle));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title="New chat" subtitle={data ? `${data.friends.length} friend${data.friends.length === 1 ? '' : 's'}` : undefined} />
      <FlatList
        data={friends}
        keyExtractor={(f) => String(f.id)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.search}>
              <Feather name="search" size={18} color={C.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search friends"
                placeholderTextColor={C.faint}
                style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
              />
            </View>
            <ActionRow icon="users" label="New group" onPress={() => router.push('/new-group')} />
            <ActionRow icon="user-plus" label="Add a friend" sub="Find people by their exact username" onPress={() => router.push('/friends')} />
            <ActionRow icon="bookmark" label="Message yourself" sub="Notes, links and reminders" onPress={openSelf} />
            <T w="bold" style={styles.section}>
              FRIENDS ON DABBA
            </T>
          </View>
        }
        ListEmptyComponent={
          !data ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
          ) : (
            <Empty icon="user-plus" title={needle ? 'No match' : 'No friends yet'} text={needle ? undefined : 'Add friends by their username to start chatting.'} />
          )
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => open(item.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceAlt }]}>
            <Avatar name={item.displayName} url={item.avatarUrl} size={46} online={item.online} />
            <View style={{ flex: 1 }}>
              <T w="bold" style={{ fontSize: 16, color: C.ink }}>
                {item.displayName}
              </T>
              <T numberOfLines={1} style={{ color: C.muted, fontSize: 13.5 }}>
                {item.about || `@${item.username}`}
              </T>
            </View>
          </Pressable>
        )}
      />
      {busy || !me ? null : null}
    </View>
  );
}

function ActionRow({ icon, label, sub, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceAlt }]}>
      <View style={styles.actionIcon}>
        <Feather name={icon} size={20} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" style={{ fontSize: 16, color: C.ink }}>
          {label}
        </T>
        {sub ? <T style={{ color: C.muted, fontSize: 13.5 }}>{sub}</T> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    margin: 16,
    marginBottom: 8,
    borderRadius: R.pill,
    paddingHorizontal: 16,
    height: 46,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchInput: { flex: 1, fontFamily: F.medium, fontSize: 15.5, color: C.text, height: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 12.5, color: C.muted, letterSpacing: 0.8, marginHorizontal: 18, marginTop: 14, marginBottom: 4 },
});
