import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { api, errorText, Person } from '@/lib/api';
import { openDirectChat, useFriends } from '@/lib/friends';
import { useAuth } from '@/lib/session';
import { C, F, R } from '@/lib/theme';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { Group, SectionLabel } from '@/components/Rows';
import { actionSheet, confirmDialog, toast } from '@/components/Overlay';
import { Btn, T } from '@/components/ui';

type Found = Person & { relation: 'none' | 'friend' | 'incoming' | 'outgoing' | 'self'; requestId: number | null; iBlocked: boolean };

export default function Friends() {
  const { me } = useAuth();
  const { data, reload } = useFriends();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const search = async () => {
    const u = q.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      toast('Type their exact username (3–20 letters, numbers or _).');
      return;
    }
    setSearching(true);
    try {
      const r = await api<{ user: Found | null }>(`/users/search?u=${encodeURIComponent(u)}`);
      setFound(r.user);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setSearching(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast(done);
      await reload();
      if (found) search();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const message = async (id: number) => {
    try {
      router.push(`/chat/${await openDirectChat(id)}`);
    } catch (e) {
      toast(errorText(e));
    }
  };

  const friendMenu = (p: Person) =>
    actionSheet({
      title: p.displayName,
      actions: [
        { label: 'Message', icon: 'message-circle', onPress: () => message(p.id) },
        {
          label: 'Remove friend',
          icon: 'user-minus',
          danger: true,
          onPress: async () => {
            if (await confirmDialog({ title: `Remove ${p.displayName}?`, message: 'Your chat history stays, but you’ll need to be friends again to start new chats.', confirm: 'Remove', danger: true }))
              act(() => api('/friends/remove', { body: { memberId: p.id } }), 'Friend removed');
          },
        },
        {
          label: 'Block',
          icon: 'slash',
          danger: true,
          onPress: async () => {
            if (await confirmDialog({ title: `Block ${p.displayName}?`, message: 'They won’t be able to message or call you.', confirm: 'Block', danger: true }))
              act(() => api('/blocks', { body: { memberId: p.id, block: true } }), 'Blocked');
          },
        },
      ],
    });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title="Friends" subtitle="Find people by their exact username" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Feather name="at-sign" size={18} color={C.muted} />
            <TextInput
              value={q}
              onChangeText={(v) => {
                setQ(v.toLowerCase().replace(/\s/g, ''));
                setFound(undefined);
              }}
              placeholder="username"
              placeholderTextColor={C.faint}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={search}
              returnKeyType="search"
              style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
              accessibilityLabel="Username to search"
            />
          </View>
          <Btn title="Find" small onPress={search} loading={searching} style={{ minHeight: 46 }} />
        </View>

        {found === null ? (
          <T style={{ color: C.muted, marginHorizontal: 20, marginBottom: 12 }}>No one has that username. Check the spelling with your friend.</T>
        ) : null}
        {found ? (
          <View style={styles.card}>
            <Avatar name={found.displayName} url={found.avatarUrl} size={52} />
            <View style={{ flex: 1 }}>
              <T w="bold" style={{ fontSize: 16.5 }}>
                {found.displayName}
              </T>
              <T style={{ color: C.muted }}>@{found.username}</T>
            </View>
            {found.relation === 'self' ? (
              <T style={{ color: C.muted }}>That’s you</T>
            ) : found.iBlocked ? (
              <Btn title="Unblock" small variant="secondary" onPress={() => act(() => api('/blocks', { body: { memberId: found.id, block: false } }), 'Unblocked')} />
            ) : found.relation === 'friend' ? (
              <Btn title="Message" small onPress={() => message(found.id)} />
            ) : found.relation === 'incoming' ? (
              <Btn title="Accept" small onPress={() => act(() => api('/friends/respond', { body: { requestId: found.requestId, accept: true } }), 'You’re now friends')} />
            ) : found.relation === 'outgoing' ? (
              <Btn title="Requested" small variant="secondary" onPress={() => act(() => api('/friends/cancel', { body: { requestId: found.requestId } }), 'Request cancelled')} />
            ) : (
              <Btn title="Add friend" small icon="user-plus" onPress={() => act(() => api('/friends/request', { body: { memberId: found.id } }), 'Friend request sent')} />
            )}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await Clipboard.setStringAsync(me?.username || '');
            toast('Your username was copied');
          }}
          style={styles.mine}
        >
          <Feather name="share-2" size={16} color={C.accent} />
          <T style={{ flex: 1, color: C.text }}>
            Your username: <T w="bold">@{me?.username}</T>
          </T>
          <T w="semibold" style={{ color: C.accent }}>
            Copy
          </T>
        </Pressable>

        {!data ? <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} /> : null}

        {data?.incoming.length ? (
          <>
            <SectionLabel>{`Requests for you · ${data.incoming.length}`}</SectionLabel>
            <Group>
              {data.incoming.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Avatar name={p.displayName} url={p.avatarUrl} size={44} />
                  <View style={{ flex: 1 }}>
                    <T w="bold">{p.displayName}</T>
                    <T style={{ color: C.muted, fontSize: 13 }}>@{p.username}</T>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decline ${p.displayName}`}
                    onPress={() => act(() => api('/friends/respond', { body: { requestId: p.requestId, accept: false } }), 'Request declined')}
                    style={[styles.round, { backgroundColor: C.surfaceAlt }]}
                  >
                    <Feather name="x" size={18} color={C.muted} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Accept ${p.displayName}`}
                    onPress={() => {
                      setBusy(p.id);
                      act(() => api('/friends/respond', { body: { requestId: p.requestId, accept: true } }), 'You’re now friends');
                    }}
                    style={[styles.round, { backgroundColor: C.accent }]}
                  >
                    {busy === p.id ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Feather name="check" size={18} color="#FFFFFF" />}
                  </Pressable>
                </View>
              ))}
            </Group>
          </>
        ) : null}

        {data?.outgoing.length ? (
          <>
            <SectionLabel>{`Sent requests · ${data.outgoing.length}`}</SectionLabel>
            <Group>
              {data.outgoing.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Avatar name={p.displayName} url={p.avatarUrl} size={44} />
                  <View style={{ flex: 1 }}>
                    <T w="bold">{p.displayName}</T>
                    <T style={{ color: C.muted, fontSize: 13 }}>Waiting for them to accept</T>
                  </View>
                  <Btn title="Cancel" small variant="secondary" onPress={() => act(() => api('/friends/cancel', { body: { requestId: p.requestId } }), 'Request cancelled')} />
                </View>
              ))}
            </Group>
          </>
        ) : null}

        {data ? (
          <>
            <SectionLabel>{`Friends · ${data.friends.length}`}</SectionLabel>
            <Group>
              {data.friends.length ? (
                data.friends.map((p) => (
                  <Pressable key={p.id} accessibilityRole="button" onPress={() => message(p.id)} onLongPress={() => friendMenu(p)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceAlt }]}>
                    <Avatar name={p.displayName} url={p.avatarUrl} size={44} online={p.online} />
                    <View style={{ flex: 1 }}>
                      <T w="bold">{p.displayName}</T>
                      <T style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>
                        {p.about || `@${p.username}`}
                      </T>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`More options for ${p.displayName}`} onPress={() => friendMenu(p)} hitSlop={8}>
                      <Feather name="more-horizontal" size={20} color={C.muted} />
                    </Pressable>
                  </Pressable>
                ))
              ) : (
                <T style={{ color: C.muted, padding: 16 }}>No friends yet. Search for a username above.</T>
              )}
            </Group>
          </>
        ) : null}

        {data?.blocked.length ? (
          <>
            <SectionLabel>Blocked</SectionLabel>
            <Group>
              {data.blocked.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Avatar name={p.displayName} url={p.avatarUrl} size={40} />
                  <T w="semibold" style={{ flex: 1 }}>
                    {p.displayName}
                  </T>
                  <Btn title="Unblock" small variant="secondary" onPress={() => act(() => api('/blocks', { body: { memberId: p.id, block: false } }), 'Unblocked')} />
                </View>
              ))}
            </Group>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 16 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchInput: { flex: 1, fontFamily: F.medium, fontSize: 16, color: C.text, height: 44 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: R.xl,
  },
  mine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.goldSoft,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: R.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
