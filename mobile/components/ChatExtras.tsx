import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View, Platform, KeyboardAvoidingView } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Conversation, errorText, Message } from '@/lib/api';
import { useConversations } from '@/lib/store';
import { isChatLocked } from '@/lib/appLock';
import { C, F, R } from '@/lib/theme';
import { Avatar } from './Avatar';
import { customSheet, toast } from './Overlay';
import { Btn, T } from './ui';

export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Photo" /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={[styles.viewerClose, { top: insets.top + 10 }]}>
          <Feather name="x" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

export function ImageDraft({
  uri,
  onCancel,
  onSend,
}: {
  uri: string | null;
  onCancel: () => void;
  onSend: (caption: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  return (
    <Modal visible={!!uri} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={{ flex: 1, backgroundColor: '#0E0D0C' }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={styles.iconBtn}>
            <Feather name="x" size={26} color="#FFFFFF" />
          </Pressable>
          <T w="bold" style={{ color: '#FFFFFF', fontSize: 17 }}>
            Send photo
          </T>
        </View>
        {uri ? <Image source={{ uri }} style={{ flex: 1, margin: 12 }} contentFit="contain" accessibilityLabel="Selected photo" /> : <View style={{ flex: 1 }} />}
        <View style={[styles.captionRow, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a caption…"
            placeholderTextColor="#9B9387"
            maxLength={1000}
            style={[styles.caption, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send photo"
            onPress={() => {
              onSend(caption.trim());
              setCaption('');
            }}
            style={styles.sendBtn}
          >
            <Feather name="send" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ForwardList({ message, close }: { message: Message; close: () => void }) {
  const { conversations } = useConversations();
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const list = conversations.filter((c) => !isChatLocked(c.id));
  const toggle = (c: Conversation) =>
    setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : p.length >= 5 ? p : [...p, c.id]));
  const send = async () => {
    setBusy(true);
    try {
      await api('/messages/forward', { body: { messageId: message.id, conversationIds: picked } });
      toast(picked.length === 1 ? 'Message forwarded' : `Forwarded to ${picked.length} chats`);
      close();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ maxHeight: 520 }}>
      <T w="bold" style={{ fontSize: 17, color: C.ink, paddingHorizontal: 20, marginBottom: 4 }}>
        Forward to…
      </T>
      <T style={{ color: C.muted, paddingHorizontal: 20, marginBottom: 8, fontSize: 13 }}>Pick up to 5 chats.</T>
      <FlatList
        data={list}
        keyExtractor={(c) => String(c.id)}
        style={{ maxHeight: 380 }}
        renderItem={({ item }) => {
          const on = picked.includes(item.id);
          return (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(item)} style={styles.fwdRow}>
              <Avatar name={item.name} url={item.avatarUrl} kind={item.type === 'group' ? 'group' : 'person'} size={40} />
              <T w="semibold" style={{ flex: 1, fontSize: 15.5 }} numberOfLines={1}>
                {item.name}
              </T>
              <View style={[styles.check, on && { backgroundColor: C.accent, borderColor: C.accent }]}>{on ? <Feather name="check" size={14} color="#FFFFFF" /> : null}</View>
            </Pressable>
          );
        }}
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        <Btn title={picked.length ? `Send to ${picked.length}` : 'Pick a chat'} disabled={!picked.length} loading={busy} onPress={send} icon="send" />
      </View>
    </View>
  );
}

export function forwardSheet(message: Message) {
  return customSheet((close) => <ForwardList message={message} close={close} />);
}

const styles = StyleSheet.create({
  viewerClose: { position: 'absolute', left: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8 },
  caption: {
    flex: 1,
    backgroundColor: '#24211E',
    color: '#FFFFFF',
    borderRadius: R.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: F.medium,
    fontSize: 15.5,
  },
  sendBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  fwdRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 9 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
});
