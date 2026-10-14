import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { api, errorText, mediaUri, Person } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { getConversation, refreshConversations } from '@/lib/store';
import { bioAvailable, getChatBio, isChatLocked, removeChatLock, setChatBio, useLockState } from '@/lib/appLock';
import { startCall } from '@/lib/calls';
import { disappearLabel, DISAPPEAR_CHOICES, lastSeen } from '@/lib/format';
import { C, R, WALLPAPERS } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { goBack } from '@/components/Header';
import { Group, Row, SectionLabel } from '@/components/Rows';
import { ChatLockGate } from '@/components/AppLock';
import { PinModal } from '@/components/PinPad';
import { actionSheet, confirmDialog, customSheet, promptDialog, toast } from '@/components/Overlay';
import { Chip, Empty, T, Toggle } from '@/components/ui';

type Info = {
  id: number;
  type: 'direct' | 'group' | 'self';
  title: string | null;
  name: string;
  disappearAfterSec: number | null;
  createdAt: string;
  members: Array<Person & { isMe: boolean }>;
  other: Person | null;
  blocked: { iBlocked: boolean; blockedMe: boolean };
  isFriend: boolean;
  counts: { media: number; links: number; voice: number };
  prefs: { muted: boolean; mutedUntil: string | null; mutedAlways: boolean; archived: boolean; pinned: boolean; favorite: boolean; wallpaper: string | null };
};

export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = Number(id);
  return (
    <ChatLockGate chatId={chatId} chatName={getConversation(chatId)?.name}>
      <ChatInfo chatId={chatId} />
    </ChatLockGate>
  );
}

function MediaSheet({ chatId }: { chatId: number }) {
  const [data, setData] = useState<{ media: Array<{ messageId: number; url: string }>; links: Array<{ messageId: number; url: string; senderName: string }>; voice: unknown[] } | null>(null);
  const [tab, setTab] = useState<'media' | 'links'>('media');
  const [viewer, setViewer] = useState<string | null>(null);
  useEffect(() => {
    api(`/conversations/${chatId}/media`).then(setData).catch(() => setData({ media: [], links: [], voice: [] }));
  }, [chatId]);
  if (viewer) {
    return (
      <View style={{ height: 460 }}>
        <Image source={{ uri: viewer }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Photo" />
        <Pressable accessibilityRole="button" onPress={() => setViewer(null)} style={{ alignSelf: 'center', padding: 14 }}>
          <T w="bold" style={{ color: C.accent }}>
            Back to all media
          </T>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ maxHeight: 520, minHeight: 280 }}>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 }}>
        <Chip label={`Media${data ? ` ${data.media.length}` : ''}`} active={tab === 'media'} onPress={() => setTab('media')} />
        <Chip label={`Links${data ? ` ${data.links.length}` : ''}`} active={tab === 'links'} onPress={() => setTab('links')} />
      </View>
      {!data ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
      ) : tab === 'media' ? (
        <FlatList
          data={data.media}
          numColumns={3}
          keyExtractor={(m) => String(m.messageId)}
          contentContainerStyle={{ paddingHorizontal: 12 }}
          ListEmptyComponent={<T style={{ textAlign: 'center', color: C.muted, marginTop: 30 }}>No photos yet.</T>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="imagebutton" onPress={() => setViewer(mediaUri(item.url))} style={{ width: '33.33%', padding: 3 }}>
              <Image source={{ uri: mediaUri(item.url) || undefined }} style={{ width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: C.sunken }} contentFit="cover" accessibilityLabel="Shared photo" />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={data.links}
          keyExtractor={(l, i) => `${l.messageId}-${i}`}
          ListEmptyComponent={<T style={{ textAlign: 'center', color: C.muted, marginTop: 30 }}>No links yet.</T>}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
              <Feather name="link" size={18} color={C.accent} />
              <View style={{ flex: 1 }}>
                <T numberOfLines={1} style={{ color: '#1D5FA8' }}>
                  {item.url}
                </T>
                <T style={{ color: C.muted, fontSize: 12.5 }}>{item.senderName}</T>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function ChatInfo({ chatId }: { chatId: number }) {
  useLockState();
  const { me } = useAuth();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<null | 'create' | 'change' | 'remove'>(null);
  const [bio, setBio] = useState(false);
  const locked = isChatLocked(chatId);

  const load = useCallback(async () => {
    try {
      setInfo(await api<Info>(`/conversations/${chatId}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [chatId]);

  useEffect(() => {
    load();
    bioAvailable().then(setBio);
  }, [load]);

  const prefs = async (body: Record<string, unknown>, msg?: string) => {
    try {
      await api(`/conversations/${chatId}/prefs`, { body });
      if (msg) toast(msg);
      await load();
      refreshConversations().catch(() => {});
    } catch (e) {
      toast(errorText(e));
    }
  };

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <Empty icon="alert-circle" title="Couldn’t load this chat" text={error} />
      </View>
    );
  }
  if (!info || !me) {
    return (
      <View style={{ flex: 1, backgroundColor: C.header, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.gold} />
      </View>
    );
  }

  const isGroup = info.type === 'group';
  const isDirect = info.type === 'direct';
  const other = info.other;
  const muteValue = info.prefs.mutedAlways ? 'always' : info.prefs.mutedUntil ? (new Date(info.prefs.mutedUntil).getTime() - Date.now() > 86400_000 ? '1w' : '8h') : 'off';
  const subtitle = isGroup
    ? `Group · ${info.members.length} members`
    : info.type === 'self'
      ? 'Only you can see this chat'
      : other
        ? `@${other.username}`
        : 'This account was deleted';

  const exportChat = async () => {
    try {
      const r = await api<{ filename: string; text: string }>(`/conversations/${chatId}/export`);
      if (Platform.OS === 'web') {
        const blob = new Blob([r.text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = r.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Chat exported');
      } else {
        await Share.share({ title: r.filename, message: r.text });
      }
    } catch (e) {
      toast(errorText(e));
    }
  };

  const clearChat = async () => {
    const ok = await confirmDialog({
      title: 'Clear this chat?',
      message: 'All messages will be removed from this chat on your account. Others will still see them.',
      confirm: 'Clear chat',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/conversations/${chatId}/clear`, { body: {} });
      toast('Chat cleared');
      refreshConversations().catch(() => {});
    } catch (e) {
      toast(errorText(e));
    }
  };

  const toggleBlock = async () => {
    if (!other) return;
    const block = !info.blocked.iBlocked;
    if (block) {
      const ok = await confirmDialog({
        title: `Block ${other.displayName}?`,
        message: 'They won’t be able to message or call you, and you won’t be able to message or call them.',
        confirm: 'Block',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await api('/blocks', { body: { memberId: other.id, block } });
      toast(block ? 'Blocked' : 'Unblocked');
      load();
    } catch (e) {
      toast(errorText(e));
    }
  };

  const leave = async () => {
    const ok = await confirmDialog({ title: `Leave “${info.name}”?`, message: 'You’ll stop getting messages from this group.', confirm: 'Leave group', danger: true });
    if (!ok) return;
    try {
      await api(`/conversations/${chatId}/leave`, { body: {} });
      await refreshConversations().catch(() => {});
      router.replace('/chats');
    } catch (e) {
      toast(errorText(e));
    }
  };

  const rename = async () => {
    const title = await promptDialog({ title: 'Group name', initial: info.title || '', maxLength: 60, confirm: 'Save' });
    if (!title || !title.trim() || title.trim() === info.title) return;
    try {
      await api(`/conversations/${chatId}`, { method: 'PATCH', body: { title: title.trim() } });
      load();
      refreshConversations().catch(() => {});
    } catch (e) {
      toast(errorText(e));
    }
  };

  const setDisappear = () =>
    actionSheet({
      title: 'Disappearing messages',
      actions: DISAPPEAR_CHOICES.map((c) => ({
        label: c.label + (c.value === (info.disappearAfterSec || 0) ? '  ✓' : ''),
        onPress: async () => {
          try {
            await api(`/conversations/${chatId}`, { method: 'PATCH', body: { disappearAfterSec: c.value } });
            load();
          } catch (e) {
            toast(errorText(e));
          }
        },
      })),
    });

  const pickWallpaper = () =>
    customSheet((close) => (
      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <T w="bold" style={{ fontSize: 17, color: C.ink, marginBottom: 14 }}>
          Chat wallpaper
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {WALLPAPERS.map((w) => {
            const on = (info.prefs.wallpaper || 'linen') === w.key;
            return (
              <Pressable
                key={w.key}
                accessibilityRole="button"
                accessibilityLabel={`${w.label} wallpaper`}
                onPress={() => {
                  close();
                  prefs({ wallpaper: w.key === 'linen' ? null : w.key }, 'Wallpaper updated');
                }}
                style={{ alignItems: 'center', gap: 6 }}
              >
                <View style={[styles.swatch, { backgroundColor: w.color }, on && { borderColor: C.accent, borderWidth: 3 }]} />
                <T style={{ fontSize: 12.5, color: C.muted }}>{w.label}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
    ));

  const addMembers = () => router.push(`/new-group?add=${chatId}`);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={[C.heroTop, C.heroMid, C.heroBottom]} style={[styles.hero, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => goBack()} style={styles.back} hitSlop={10}>
            <Feather name="chevron-left" size={28} color="#FFFFFF" />
          </Pressable>
          <Avatar name={info.name} url={isDirect ? other?.avatarUrl : info.type === 'self' ? me.avatarUrl : null} kind={isGroup ? 'group' : 'person'} size={108} ring />
          <T w="extrabold" style={styles.name} numberOfLines={2}>
            {info.name}
          </T>
          <T style={styles.sub}>{subtitle}</T>
          {isDirect && other ? <T style={[styles.sub, { marginTop: 2 }]}>{lastSeen(other.lastSeenAt, other.online)}</T> : null}
          {isDirect && other?.about ? <T style={styles.about}>“{other.about}”</T> : null}
          <View style={styles.actions}>
            {isDirect && other && !info.blocked.iBlocked && !info.blocked.blockedMe ? (
              <HeroAction icon="phone" label="Call" onPress={() => startCall(chatId, { name: other.displayName, avatarUrl: other.avatarUrl }).catch((e) => toast(errorText(e)))} />
            ) : null}
            <HeroAction icon="message-circle" label="Message" onPress={() => goBack(`/chat/${chatId}`)} />
            <HeroAction
              icon={info.prefs.muted ? 'bell' : 'bell-off'}
              label={info.prefs.muted ? 'Unmute' : 'Mute'}
              onPress={() => prefs({ mute: info.prefs.muted ? 'off' : 'always' }, info.prefs.muted ? 'Unmuted' : 'Muted')}
            />
          </View>
        </LinearGradient>

        <View style={{ height: 16 }} />
        <Group>
          <Row
            icon="image"
            label="Media, links and voice"
            value={`${info.counts.media} · ${info.counts.links} · ${info.counts.voice}`}
            onPress={() => customSheet(() => <MediaSheet chatId={chatId} />)}
            chevron
          />
          <Row icon="droplet" label="Chat wallpaper" value={WALLPAPERS.find((w) => w.key === (info.prefs.wallpaper || 'linen'))?.label} onPress={pickWallpaper} chevron />
          <Row icon="clock" label="Disappearing messages" value={disappearLabel(info.disappearAfterSec)} onPress={setDisappear} chevron last />
        </Group>

        <SectionLabel>Notifications</SectionLabel>
        <Group>
          <View style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Feather name="bell-off" size={18} color={C.accent} />
              <T w="semibold" style={{ fontSize: 16 }}>
                Mute notifications
              </T>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                ['off', 'Off'],
                ['8h', '8 hours'],
                ['1w', '1 week'],
                ['always', 'Always'],
              ].map(([v, l]) => (
                <Chip key={v} label={l} active={muteValue === v} onPress={() => prefs({ mute: v })} />
              ))}
            </View>
          </View>
        </Group>

        <SectionLabel>Privacy</SectionLabel>
        <Group>
          <Row
            icon="lock"
            label="Lock this chat"
            sublabel={locked ? 'This chat needs its own code to open.' : 'Hide it in Locked chats behind its own code.'}
            right={<Toggle value={locked} onValueChange={(v) => setPin(v ? 'create' : 'remove')} />}
          />
          {locked ? <Row icon="key" label="Change chat code" onPress={() => setPin('change')} chevron /> : null}
          {locked && bio ? (
            <Row
              icon="aperture"
              label="Unlock with fingerprint"
              right={
                <Toggle
                  value={getChatBio(chatId)}
                  onValueChange={(v) => {
                    setChatBio(chatId, v);
                    toast(v ? 'Fingerprint unlock on' : 'Fingerprint unlock off');
                  }}
                />
              }
            />
          ) : null}
          <Row
            icon="star"
            label={info.prefs.favorite ? 'Remove from favourites' : 'Add to favourites'}
            onPress={() => prefs({ favorite: !info.prefs.favorite }, info.prefs.favorite ? 'Removed from favourites' : 'Added to favourites')}
          />
          <Row icon="archive" label={info.prefs.archived ? 'Unarchive chat' : 'Archive chat'} onPress={() => prefs({ archived: !info.prefs.archived }, info.prefs.archived ? 'Chat unarchived' : 'Chat archived')} />
          <Row icon="download" label="Export chat" sublabel="Save the conversation as a text file." onPress={exportChat} last />
        </Group>

        {isGroup ? (
          <>
            <SectionLabel>{`${info.members.length} members`}</SectionLabel>
            <Group>
              <Row icon="user-plus" label="Add members" onPress={addMembers} />
              <Row icon="edit-3" label="Rename group" onPress={rename} />
              {info.members.map((m, i) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  disabled={m.isMe}
                  onPress={async () => {
                    try {
                      const r = await api<{ id: number }>('/conversations/direct', { body: { memberId: m.id } });
                      router.push(`/chat/${r.id}`);
                    } catch (e) {
                      toast(errorText(e));
                    }
                  }}
                  style={[styles.member, i < info.members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }]}
                >
                  <Avatar name={m.displayName} url={m.avatarUrl} size={40} online={m.online && !m.isMe} />
                  <View style={{ flex: 1 }}>
                    <T w="semibold" style={{ fontSize: 15.5 }}>
                      {m.isMe ? 'You' : m.displayName}
                    </T>
                    <T style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>
                      {m.about || `@${m.username}`}
                    </T>
                  </View>
                </Pressable>
              ))}
            </Group>
          </>
        ) : null}

        <Group>
          <Row icon="trash-2" label="Clear chat" danger onPress={clearChat} last={!isGroup && !isDirect} />
          {isDirect && other ? <Row icon="slash" label={info.blocked.iBlocked ? `Unblock ${other.displayName}` : `Block ${other.displayName}`} danger onPress={toggleBlock} last /> : null}
          {isGroup ? <Row icon="log-out" label="Leave group" danger onPress={leave} last /> : null}
        </Group>
      </ScrollView>

      <PinModal
        visible={pin === 'create' || pin === 'change'}
        mode={pin === 'change' ? 'change' : 'create'}
        target={{ kind: 'chat', id: chatId, name: info.name }}
        onDone={(ok) => {
          if (ok) toast(pin === 'change' ? 'Chat code changed' : 'Chat locked');
          setPin(null);
        }}
      />
      <PinModal
        visible={pin === 'remove'}
        mode="verify"
        target={{ kind: 'chat', id: chatId, name: info.name }}
        onDone={async (ok) => {
          if (ok) {
            await removeChatLock(chatId);
            toast('Chat unlocked');
          }
          setPin(null);
        }}
      />
    </View>
  );
}

function HeroAction({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.heroAction, pressed && { opacity: 0.8 }]}>
      <Feather name={icon} size={20} color={C.gold} />
      <T w="semibold" style={{ color: '#F1EADF', fontSize: 12.5 }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 22, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  back: { alignSelf: 'flex-start', width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  name: { color: '#FFFFFF', fontSize: 26, marginTop: 14, textAlign: 'center' },
  sub: { color: '#CFC7BA', marginTop: 4, fontSize: 14.5 },
  about: { color: '#E6DED1', marginTop: 10, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 20 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  heroAction: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: R.lg,
    paddingVertical: 12,
    width: 92,
    borderWidth: 1,
    borderColor: 'rgba(216,162,74,0.25)',
  },
  swatch: { width: 60, height: 84, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
