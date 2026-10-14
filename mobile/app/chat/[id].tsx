import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { api, ApiError, ChatMeta, errorText, Message, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { getConversation, patchConversation, refreshConversations, setOpenChat } from '@/lib/store';
import { usePolling } from '@/lib/hooks';
import { dayKey, dayLabel, disappearLabel, duration, lastSeen } from '@/lib/format';
import { startCall } from '@/lib/calls';
import { C, F, R, wallpaperColor } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { goBack, HeaderIcon } from '@/components/Header';
import { ChatLockGate } from '@/components/AppLock';
import { MessageBubble } from '@/components/MessageBubble';
import { ImageDraft, ImageViewer, forwardSheet } from '@/components/ChatExtras';
import { actionSheet, alertDialog, confirmDialog, toast } from '@/components/Overlay';
import { Empty, T, tap } from '@/components/ui';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type MessagesResp = {
  messages: Message[];
  hasMore: boolean;
  chat: ChatMeta;
  typing: string | null;
  pinned: { id: number; kind: string; body: string | null; senderName: string } | null;
};

function mergeLatest(prev: Message[], latest: Message[]): Message[] {
  const pending = prev.filter((m) => m.id < 0);
  if (!latest.length) return pending;
  const minLatest = latest[latest.length - 1].id;
  const older = prev.filter((m) => m.id > 0 && m.id < minLatest);
  return [...pending, ...latest, ...older];
}

function insertReal(prev: Message[], tempId: number, real: Message): Message[] {
  const rest = prev.filter((m) => m.id !== tempId && m.id !== real.id);
  const pending = rest.filter((m) => m.id < 0);
  const positive = [real, ...rest.filter((m) => m.id > 0)].sort((a, b) => b.id - a.id);
  return [...pending, ...positive];
}

// Voice notes: mono 64 kbps AAC (~0.5 MB per minute) keeps uploads small.
const VOICE_PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { ...RecordingPresets.HIGH_QUALITY.android, sampleRate: 44100 },
  ios: { ...RecordingPresets.HIGH_QUALITY.ios, sampleRate: 44100 },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

let tempSeq = 0;
const tempId = () => -(Date.now() * 10 + (tempSeq++ % 10));

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = Number(id);
  const conv = getConversation(chatId);
  if (!Number.isFinite(chatId) || chatId <= 0) return <Empty icon="alert-circle" title="Chat not found" />;
  return (
    <ChatLockGate chatId={chatId} chatName={conv?.name}>
      <ChatInner chatId={chatId} />
    </ChatLockGate>
  );
}

function ChatInner({ chatId }: { chatId: number }) {
  const { me } = useAuth();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const cached = getConversation(chatId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<ChatMeta | null>(
    cached
      ? {
          id: cached.id,
          type: cached.type,
          name: cached.name,
          memberCount: cached.memberCount,
          disappearAfterSec: cached.disappearAfterSec,
          wallpaper: cached.wallpaper,
          other: cached.other
            ? { id: cached.other.id, name: cached.other.displayName, avatarUrl: cached.other.avatarUrl, username: cached.other.username, lastSeenAt: cached.other.lastSeenAt, online: cached.other.online }
            : null,
        }
      : null,
  );
  const [typingName, setTypingName] = useState<string | null>(null);
  const [pinned, setPinned] = useState<MessagesResp['pinned']>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [blocked, setBlocked] = useState<{ iBlocked: boolean; blockedMe: boolean } | null>(null);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[] | null>(null);

  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const lastTyping = useRef(0);
  const firstLoad = useRef(true);

  const recorder = useAudioRecorder(VOICE_PRESET);
  const recState = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);

  // ---------------------------------------------------------------- data
  const loadLatest = useCallback(async () => {
    try {
      const r = await api<MessagesResp>(`/conversations/${chatId}/messages?limit=40&markRead=1`);
      setChat(r.chat);
      setTypingName(r.typing);
      setPinned(r.pinned);
      setMessages((prev) => mergeLatest(prev, r.messages));
      if (firstLoad.current) {
        setHasMore(r.hasMore);
        firstLoad.current = false;
      }
      setLoading(false);
      setOffline(false);
      patchConversation(chatId, { unread: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else if (e instanceof ApiError && e.status === 0) setOffline(true);
      setLoading(false);
    }
  }, [chatId]);

  usePolling(loadLatest, 2500, focused && !!me);

  useEffect(() => {
    if (!focused) return;
    setOpenChat(chatId);
    return () => setOpenChat(null);
  }, [focused, chatId]);

  useEffect(() => {
    api<{ blocked: { iBlocked: boolean; blockedMe: boolean } }>(`/conversations/${chatId}`)
      .then((r) => setBlocked(r.blocked))
      .catch(() => {});
  }, [chatId, focused]);

  const loadOlder = async () => {
    if (!hasMore || loadingOlder) return;
    const oldest = [...messages].reverse().find((m) => m.id > 0);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const r = await api<MessagesResp>(`/conversations/${chatId}/messages?before=${oldest.id}&limit=40`);
      setMessages((prev) => [...prev, ...r.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
      setHasMore(r.hasMore);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setLoadingOlder(false);
    }
  };

  // ---------------------------------------------------------------- sending
  const pushTemp = (partial: Partial<Message>): Message => {
    const m: Message = {
      id: tempId(),
      conversationId: chatId,
      senderId: me!.id,
      senderName: me!.displayName,
      senderAvatar: me!.avatarUrl,
      kind: 'text',
      body: null,
      mediaUrl: null,
      durationMs: null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      expiresAt: null,
      pinnedAt: null,
      forwarded: false,
      starred: false,
      reactions: [],
      replyTo: replyTo
        ? { id: replyTo.id, senderId: replyTo.senderId, senderName: replyTo.senderName, kind: replyTo.kind, body: replyTo.body, mediaUrl: replyTo.mediaUrl, deleted: false }
        : null,
      status: 'pending',
      ...partial,
    };
    setMessages((prev) => [m, ...prev]);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    return m;
  };

  const deliver = async (temp: Message, body: Record<string, unknown>) => {
    try {
      const r = await api<{ message: Message }>(`/conversations/${chatId}/messages`, { body });
      setMessages((prev) => insertReal(prev, temp.id, r.message));
      refreshConversations().catch(() => {});
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...m, status: 'failed' } : m)));
      toast(errorText(e));
    }
  };

  const sendText = async () => {
    const body = text.trim();
    if (!body || !me) return;
    if (editing) {
      const target = editing;
      setEditing(null);
      setText('');
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, body, editedAt: new Date().toISOString() } : m)));
      try {
        await api(`/messages/${target.id}`, { method: 'PATCH', body: { body } });
      } catch (e) {
        toast(errorText(e));
        loadLatest();
      }
      return;
    }
    const reply = replyTo;
    setText('');
    setReplyTo(null);
    const temp = pushTemp({ kind: 'text', body });
    lastTyping.current = 0;
    await deliver(temp, { kind: 'text', body, replyToId: reply?.id });
  };

  const retry = (m: Message) =>
    actionSheet({
      title: 'This message was not sent',
      actions: [
        {
          label: 'Try again',
          icon: 'refresh-cw',
          onPress: () => {
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'pending' } : x)));
            deliver(m, { kind: m.kind, body: m.body, mediaUrl: m.mediaUrl, durationMs: m.durationMs, replyToId: m.replyTo?.id });
          },
        },
        { label: 'Delete', icon: 'trash-2', danger: true, onPress: () => setMessages((prev) => prev.filter((x) => x.id !== m.id)) },
      ],
    });

  const onChangeText = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 3000) {
      lastTyping.current = now;
      api(`/conversations/${chatId}/typing`, { body: { typing: true } }).catch(() => {});
    }
  };

  // ---------------------------------------------------------------- photos
  const pickImage = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return alertDialog('Camera access needed', 'Allow camera access in your phone settings to take photos.');
        const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
        if (!r.canceled && r.assets?.[0]) setDraftImage(r.assets[0].uri);
      } else {
        if (Platform.OS !== 'web') {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) return alertDialog('Photo access needed', 'Allow photo access in your phone settings to send pictures.');
        }
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!r.canceled && r.assets?.[0]) setDraftImage(r.assets[0].uri);
      }
    } catch (e) {
      toast(errorText(e));
    }
  };

  const sendImage = async (uri: string, caption: string) => {
    setDraftImage(null);
    const temp = pushTemp({ kind: 'image', localUri: uri, body: caption || null });
    const reply = replyTo;
    setReplyTo(null);
    try {
      let finalUri = uri;
      try {
        const out = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
        finalUri = out.uri;
      } catch {
        /* send original */
      }
      const up = await uploadFile(finalUri, 'photo.jpg', 'image/jpeg');
      await deliver({ ...temp }, { kind: 'image', mediaUrl: up.url, body: caption || undefined, replyToId: reply?.id });
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...m, status: 'failed' } : m)));
      toast(errorText(e));
    }
  };

  // ---------------------------------------------------------------- voice notes
  const startRecording = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        alertDialog('Microphone needed', 'Allow microphone access to send voice messages.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      tap('medium');
      setRecording(true);
    } catch (e) {
      setRecording(false);
      toast(`Couldn't start recording. ${errorText(e)}`);
    }
  };

  const stopRecording = async (send: boolean) => {
    const dur = recState.durationMillis || 0;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      /* already stopped */
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!send) return;
    if (!uri) return toast('Recording failed. Please try again.');
    if (dur < 800) return toast('Too short — hold on a little longer.');
    if (dur > 8 * 60 * 1000) return toast('Voice messages can be up to 8 minutes.');
    const temp = pushTemp({ kind: 'audio', localUri: uri, durationMs: dur });
    const reply = replyTo;
    setReplyTo(null);
    try {
      const web = Platform.OS === 'web';
      const up = await uploadFile(uri, web ? 'voice.webm' : 'voice.m4a', web ? 'audio/webm' : 'audio/m4a');
      await deliver(temp, { kind: 'audio', mediaUrl: up.url, durationMs: dur, replyToId: reply?.id });
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...m, status: 'failed' } : m)));
      toast(errorText(e));
    }
  };

  // ---------------------------------------------------------------- message actions
  const react = async (m: Message, emoji: string) => {
    const mine = m.reactions.find((r) => r.memberId === me?.id);
    const next = mine?.emoji === emoji ? null : emoji;
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? { ...x, reactions: [...x.reactions.filter((r) => r.memberId !== me?.id), ...(next ? [{ memberId: me!.id, emoji: next, name: me!.displayName }] : [])] }
          : x,
      ),
    );
    try {
      await api(`/messages/${m.id}/react`, { body: { emoji: next } });
    } catch (e) {
      toast(errorText(e));
      loadLatest();
    }
  };

  const showReactions = (m: Message) =>
    actionSheet({
      title: 'Reactions',
      actions: m.reactions.map((r) => ({
        label: `${r.emoji}  ${r.memberId === me?.id ? 'You' : r.name}`,
        sublabel: r.memberId === me?.id ? 'Tap to remove' : undefined,
        onPress: r.memberId === me?.id ? () => react(m, r.emoji) : undefined,
      })),
    });

  const remove = async (m: Message, mode: 'me' | 'everyone') => {
    const ok = await confirmDialog({
      title: mode === 'everyone' ? 'Delete for everyone?' : 'Delete for you?',
      message: mode === 'everyone' ? 'This message will be removed for everyone in this chat.' : 'Others in the chat will still see it.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setMessages((prev) =>
      mode === 'me' ? prev.filter((x) => x.id !== m.id) : prev.map((x) => (x.id === m.id ? { ...x, deletedAt: new Date().toISOString(), body: null, mediaUrl: null } : x)),
    );
    try {
      await api(`/messages/${m.id}?for=${mode}`, { method: 'DELETE' });
      refreshConversations().catch(() => {});
    } catch (e) {
      toast(errorText(e));
      loadLatest();
    }
  };

  const onLongPress = (m: Message) => {
    if (!me) return;
    if (m.id < 0) {
      if (m.status === 'failed') retry(m);
      return;
    }
    const mine = m.senderId === me.id;
    const deleted = !!m.deletedAt;
    const content = !deleted && m.kind !== 'call';
    const canEdit = mine && m.kind === 'text' && !deleted && Date.now() - new Date(m.createdAt).getTime() < 15 * 60 * 1000;
    const myReaction = m.reactions.find((r) => r.memberId === me.id)?.emoji || null;
    actionSheet({
      quick: content ? { items: REACTIONS, selected: myReaction, onPick: (e) => react(m, e) } : undefined,
      actions: [
        ...(content ? [{ label: 'Reply', icon: 'corner-up-left' as const, onPress: () => { setEditing(null); setReplyTo(m); inputRef.current?.focus(); } }] : []),
        ...(m.kind === 'text' && !deleted
          ? [{ label: 'Copy', icon: 'copy' as const, onPress: async () => { await Clipboard.setStringAsync(m.body || ''); toast('Copied'); } }]
          : []),
        ...(canEdit ? [{ label: 'Edit', icon: 'edit-2' as const, onPress: () => { setReplyTo(null); setEditing(m); setText(m.body || ''); inputRef.current?.focus(); } }] : []),
        ...(content && ['text', 'image', 'audio'].includes(m.kind) ? [{ label: 'Forward', icon: 'corner-up-right' as const, onPress: () => forwardSheet(m) }] : []),
        ...(content
          ? [
              {
                label: m.starred ? 'Unstar' : 'Star',
                icon: 'star' as const,
                onPress: async () => {
                  setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, starred: !m.starred } : x)));
                  await api(`/messages/${m.id}/star`, { body: { starred: !m.starred } }).catch((e) => toast(errorText(e)));
                },
              },
              {
                label: m.pinnedAt ? 'Unpin' : 'Pin',
                icon: 'bookmark' as const,
                onPress: async () => {
                  await api(`/messages/${m.id}/pin`, { body: { pinned: !m.pinnedAt } }).catch((e) => toast(errorText(e)));
                  loadLatest();
                },
              },
            ]
          : []),
        { label: 'Delete for me', icon: 'trash' as const, danger: true, onPress: () => remove(m, 'me') },
        ...(mine && !deleted && m.kind !== 'call' ? [{ label: 'Delete for everyone', icon: 'trash-2' as const, danger: true, onPress: () => remove(m, 'everyone') }] : []),
      ],
    });
  };

  // ---------------------------------------------------------------- jumping / search
  const jumpTo = async (targetId: number) => {
    let list = messages;
    let more = hasMore;
    let guard = 0;
    while (!list.some((m) => m.id === targetId) && more && guard < 10) {
      guard++;
      const oldest = [...list].reverse().find((m) => m.id > 0);
      if (!oldest) break;
      const r = await api<MessagesResp>(`/conversations/${chatId}/messages?before=${oldest.id}&limit=60`);
      list = [...list, ...r.messages.filter((m) => !list.some((p) => p.id === m.id))];
      more = r.hasMore;
    }
    setMessages(list);
    setHasMore(more);
    const index = list.findIndex((m) => m.id === targetId);
    if (index < 0) return toast('That message is no longer available.');
    setFlashId(targetId);
    setTimeout(() => setFlashId(null), 1600);
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 60);
  };

  useEffect(() => {
    if (!searchOpen || !query.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ messages: Message[] }>(`/conversations/${chatId}/search?q=${encodeURIComponent(query.trim())}`);
        setResults(r.messages);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, searchOpen, chatId]);

  // ---------------------------------------------------------------- header actions
  const openInfo = () => router.push(`/chat-info/${chatId}`);
  const call = async () => {
    if (!chat?.other) return;
    try {
      await startCall(chatId, { name: chat.other.name, avatarUrl: chat.other.avatarUrl });
    } catch (e) {
      toast(errorText(e));
    }
  };
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
      } else {
        await Share.share({ title: r.filename, message: r.text });
      }
    } catch (e) {
      toast(errorText(e));
    }
  };
  const menu = () =>
    actionSheet({
      actions: [
        { label: chat?.type === 'group' ? 'Group info' : 'Contact info', icon: 'info', onPress: openInfo },
        { label: 'Search', icon: 'search', onPress: () => setSearchOpen(true) },
        { label: 'Export chat', icon: 'download', onPress: exportChat },
      ],
    });

  // ---------------------------------------------------------------- render helpers
  const isGroup = chat?.type === 'group';
  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const older = messages[index + 1];
      const newDay = !older || dayKey(older.createdAt) !== dayKey(item.createdAt);
      const firstInRun = newDay || !older || older.senderId !== item.senderId || older.kind === 'system';
      return (
        <MessageBubble
          m={item}
          mine={item.senderId === me?.id}
          isGroup={!!isGroup}
          firstInRun={firstInRun}
          dayText={newDay ? dayLabel(item.createdAt) : null}
          highlight={searchOpen ? query.trim() : undefined}
          flash={flashId === item.id}
          onLongPress={onLongPress}
          onOpenImage={setViewer}
          onReplyPress={jumpTo}
          onCallBack={chat?.type === 'direct' ? call : undefined}
          onRetry={retry}
          onReactionsPress={showReactions}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, me?.id, isGroup, flashId, searchOpen, query, chat?.type],
  );

  const subtitle = useMemo(() => {
    if (!chat) return '';
    if (typingName) return chat.type === 'group' ? `${typingName.split(',')[0]} is typing…` : 'typing…';
    if (chat.type === 'self') return 'Only you can see this';
    if (chat.type === 'group') return `${chat.memberCount} member${chat.memberCount === 1 ? '' : 's'} · tap for info`;
    if (!chat.other) return 'Deleted account';
    return lastSeen(chat.other.lastSeenAt, chat.other.online);
  }, [chat, typingName]);

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ChatHeader title="Chat" subtitle="" onBack={() => goBack()} />
        <Empty icon="message-circle" title="Chat not found" text="It may have been deleted, or you left this group." />
      </View>
    );
  }

  const name = chat?.name || cached?.name || 'Chat';
  const canCall = chat?.type === 'direct' && !!chat.other && !blocked?.iBlocked && !blocked?.blockedMe;
  const blockedNote = blocked?.iBlocked ? 'You blocked this contact.' : blocked?.blockedMe ? "You can't send messages to this contact." : null;

  return (
    <View style={{ flex: 1, backgroundColor: wallpaperColor(chat?.wallpaper) }}>
      {searchOpen ? (
        <View style={[styles.searchHeader, { paddingTop: insets.top }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={() => { setSearchOpen(false); setQuery(''); }} style={styles.hIcon}>
            <Feather name="arrow-left" size={24} color="#FFFFFF" />
          </Pressable>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search this chat"
            placeholderTextColor="#B9B0A2"
            style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
            returnKeyType="search"
          />
        </View>
      ) : (
        <ChatHeader
          title={name}
          subtitle={subtitle}
          typing={!!typingName}
          avatar={<Avatar name={name} url={chat?.type === 'direct' ? chat.other?.avatarUrl : chat?.type === 'self' ? me?.avatarUrl : null} kind={isGroup ? 'group' : 'person'} size={38} />}
          onBack={() => goBack()}
          onTitlePress={openInfo}
          right={
            <>
              {canCall ? <HeaderIcon name="phone" label="Voice call" onPress={call} /> : null}
              <HeaderIcon name="more-vertical" label="Chat options" onPress={menu} />
            </>
          }
        />
      )}

      {pinned && !searchOpen ? (
        <Pressable accessibilityRole="button" onPress={() => jumpTo(pinned.id)} style={styles.pinBar}>
          <Ionicons name="pin" size={16} color={C.accent} />
          <View style={{ flex: 1 }}>
            <T w="bold" style={{ fontSize: 12.5, color: C.accent }}>
              Pinned message
            </T>
            <T numberOfLines={1} style={{ fontSize: 13.5, color: C.text }}>
              {pinned.kind === 'image' ? `📷 ${pinned.body || 'Photo'}` : pinned.kind === 'audio' ? '🎤 Voice message' : pinned.body}
            </T>
          </View>
        </Pressable>
      ) : null}

      {searchOpen && results ? (
        <View style={styles.results}>
          <FlatList
            data={results}
            keyExtractor={(m) => String(m.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<T style={{ padding: 20, color: C.muted, textAlign: 'center' }}>No messages found.</T>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSearchOpen(false);
                  jumpTo(item.id);
                }}
                style={styles.resultRow}
              >
                <T w="bold" style={{ fontSize: 13, color: C.accent }}>
                  {item.senderId === me?.id ? 'You' : item.senderName} · {dayLabel(item.createdAt)}
                </T>
                <T numberOfLines={2} style={{ color: C.text, marginTop: 2 }}>
                  {item.body}
                </T>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'} keyboardVerticalOffset={0}>
        {loading && !messages.length ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            inverted
            keyExtractor={(m) => String(m.id)}
            renderItem={renderItem}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: 10 }}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
              setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 120);
            }}
            ListFooterComponent={
              <View>
                {loadingOlder ? <ActivityIndicator color={C.accent} style={{ margin: 12 }} /> : null}
                {!hasMore ? (
                  <View style={styles.notice}>
                    <Feather name="info" size={13} color={C.chipText} />
                    <T style={{ color: C.chipText, fontSize: 12.5, flex: 1, textAlign: 'center' }}>
                      {chat?.type === 'self'
                        ? 'Notes to self. Only you can see these messages.'
                        : 'Messages are protected in transit and stored privately on Dabba’s server. See Settings › Security for details.'}
                    </T>
                  </View>
                ) : null}
              </View>
            }
            ListHeaderComponent={
              typingName ? (
                <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>
                  <View style={styles.typingBubble}>
                    <T style={{ color: C.muted, fontSize: 13 }}>{chat?.type === 'group' ? `${typingName.split(',')[0]} is typing…` : 'typing…'}</T>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {offline ? (
          <View style={styles.offline}>
            <Feather name="wifi-off" size={13} color={C.warnText} />
            <T style={{ color: C.warnText, fontSize: 12.5 }}>Connecting… messages will send when you’re back online.</T>
          </View>
        ) : null}

        {chat?.disappearAfterSec && !blockedNote ? (
          <View style={styles.disappear}>
            <Feather name="clock" size={12} color={C.chipText} />
            <T style={{ color: C.chipText, fontSize: 12 }}>Disappearing messages: {disappearLabel(chat.disappearAfterSec)}</T>
          </View>
        ) : null}

        {blockedNote ? (
          <View style={[styles.blocked, { paddingBottom: insets.bottom + 12 }]}>
            <T style={{ color: C.muted, textAlign: 'center' }}>{blockedNote}</T>
            {blocked?.iBlocked && chat?.other ? (
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  await api('/blocks', { body: { memberId: chat.other!.id, block: false } }).catch((e) => toast(errorText(e)));
                  setBlocked({ iBlocked: false, blockedMe: false });
                  toast('Unblocked');
                }}
              >
                <T w="bold" style={{ color: C.accent, marginTop: 6 }}>
                  Tap to unblock
                </T>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
            {replyTo || editing ? (
              <View style={styles.replyBar}>
                <View style={styles.replyAccent} />
                <View style={{ flex: 1 }}>
                  <T w="bold" style={{ color: C.accent, fontSize: 13 }}>
                    {editing ? 'Edit message' : `Replying to ${replyTo!.senderId === me?.id ? 'yourself' : replyTo!.senderName}`}
                  </T>
                  <T numberOfLines={1} style={{ color: C.muted, fontSize: 13.5 }}>
                    {(editing || replyTo)!.kind === 'image' ? `📷 ${(editing || replyTo)!.body || 'Photo'}` : (editing || replyTo)!.kind === 'audio' ? '🎤 Voice message' : (editing || replyTo)!.body}
                  </T>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  onPress={() => {
                    if (editing) setText('');
                    setEditing(null);
                    setReplyTo(null);
                  }}
                  hitSlop={10}
                >
                  <Feather name="x" size={20} color={C.muted} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composer}>
              {recording ? (
                <View style={[styles.inputPill, { justifyContent: 'space-between', paddingHorizontal: 14 }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Discard recording" onPress={() => stopRecording(false)} hitSlop={10}>
                    <Feather name="trash-2" size={21} color={C.danger} />
                  </Pressable>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.recDot} />
                    <T w="semibold" style={{ color: C.ink }}>
                      {duration(recState.durationMillis)}
                    </T>
                    <T style={{ color: C.muted }}>Recording…</T>
                  </View>
                  <View style={{ width: 21 }} />
                </View>
              ) : (
                <View style={styles.inputPill}>
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={onChangeText}
                    placeholder="Message"
                    placeholderTextColor={C.faint}
                    multiline
                    maxLength={4000}
                    style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                    accessibilityLabel="Message"
                    onKeyPress={(e) => {
                      // Desktop browsers: Enter sends, Shift+Enter adds a line.
                      const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                      if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                        (e as unknown as { preventDefault: () => void }).preventDefault?.();
                        sendText();
                      }
                    }}
                  />
                  {!editing ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Attach a photo"
                        onPress={() =>
                          actionSheet({
                            actions: [
                              { label: 'Photo library', icon: 'image', onPress: () => pickImage('library') },
                              { label: 'Camera', icon: 'camera', onPress: () => pickImage('camera') },
                            ],
                          })
                        }
                        hitSlop={8}
                        style={styles.pillIcon}
                      >
                        <Feather name="paperclip" size={21} color={C.muted} />
                      </Pressable>
                      {!text ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Take a photo" onPress={() => pickImage('camera')} hitSlop={8} style={styles.pillIcon}>
                          <Feather name="camera" size={21} color={C.muted} />
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={recording ? 'Send voice message' : text.trim() ? (editing ? 'Save edit' : 'Send') : 'Record voice message'}
                onPress={() => {
                  if (recording) stopRecording(true);
                  else if (text.trim()) sendText();
                  else startRecording();
                }}
                style={({ pressed }) => [styles.sendBtn, pressed && { transform: [{ scale: 0.94 }] }]}
              >
                <Feather name={recording || text.trim() ? (editing ? 'check' : 'send') : 'mic'} size={21} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
      <ImageDraft uri={draftImage} onCancel={() => setDraftImage(null)} onSend={(caption) => draftImage && sendImage(draftImage, caption)} />
    </View>
  );
}

function ChatHeader({
  title,
  subtitle,
  avatar,
  onBack,
  onTitlePress,
  right,
  typing,
}: {
  title: string;
  subtitle: string;
  avatar?: React.ReactNode;
  onBack: () => void;
  onTitlePress?: () => void;
  right?: React.ReactNode;
  typing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.header, paddingTop: insets.top }}>
      <View style={styles.headerBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.hIcon} hitSlop={8}>
          <Feather name="chevron-left" size={28} color="#FFFFFF" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}, open info`} onPress={onTitlePress} style={styles.headerTitle}>
          {avatar}
          <View style={{ flex: 1 }}>
            <T w="bold" numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 17.5 }}>
              {title}
            </T>
            {subtitle ? (
              <T numberOfLines={1} style={{ color: typing ? C.gold : C.headerMuted, fontSize: 12.5, marginTop: 1 }}>
                {subtitle}
              </T>
            ) : null}
          </View>
        </Pressable>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  hIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  searchHeader: { backgroundColor: C.header, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 8, minHeight: 60 },
  searchInput: { flex: 1, color: '#FFFFFF', fontFamily: F.medium, fontSize: 16.5, paddingVertical: 10, marginRight: 12 },
  results: { maxHeight: 300, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line },
  resultRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  pinBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  notice: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: C.goldSoft,
    marginHorizontal: 30,
    marginVertical: 12,
    padding: 10,
    borderRadius: R.md,
  },
  typingBubble: { alignSelf: 'flex-start', backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginBottom: 6 },
  offline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.warnBg, paddingVertical: 6 },
  disappear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 3 },
  blocked: { backgroundColor: C.surface, paddingTop: 14, paddingHorizontal: 20, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    marginHorizontal: 8,
    marginBottom: 6,
    padding: 10,
    borderRadius: R.lg,
  },
  replyAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.accent },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 8, paddingTop: 2 },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: C.surface,
    borderRadius: 26,
    minHeight: 50,
    paddingLeft: 16,
    paddingRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  input: { flex: 1, fontFamily: F.regular, fontSize: 16, color: C.text, maxHeight: 130, paddingTop: 14, paddingBottom: 13 },
  pillIcon: { width: 38, height: 48, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger },
});
