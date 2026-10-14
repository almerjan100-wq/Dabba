import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Conversation, TickStatus } from '@/lib/api';
import { listStamp, previewText } from '@/lib/format';
import { C } from '@/lib/theme';
import { Avatar } from './Avatar';
import { T } from './ui';

export function Ticks({ status, size = 16, onDark }: { status?: TickStatus | null; size?: number; onDark?: boolean }) {
  if (!status) return null;
  const base = onDark ? C.bubbleMineMeta : C.faint;
  if (status === 'pending') return <Feather name="clock" size={size - 4} color={base} accessibilityLabel="Sending" />;
  if (status === 'failed') return <Feather name="alert-circle" size={size - 3} color={C.danger} accessibilityLabel="Not sent" />;
  if (status === 'sent') return <Ionicons name="checkmark" size={size} color={base} accessibilityLabel="Sent" />;
  return (
    <Ionicons
      name="checkmark-done"
      size={size}
      color={status === 'read' ? (onDark ? C.readTick : '#2C7BD6') : base}
      accessibilityLabel={status === 'read' ? 'Read' : 'Delivered'}
    />
  );
}

export function ChatRow({
  c,
  meId,
  onPress,
  onLongPress,
  locked,
}: {
  c: Conversation;
  meId: number;
  onPress: () => void;
  onLongPress?: () => void;
  locked?: boolean;
}) {
  const last = c.lastMessage;
  const mine = last && last.senderId === meId;
  let preview = '';
  if (locked) preview = 'Locked chat';
  else if (c.typing) preview = c.type === 'group' ? `${c.typing} typing…` : 'typing…';
  else if (last) {
    const text = last.kind === 'system' ? last.body || '' : previewText(last.kind, last.body, last.deleted, last.durationMs);
    preview = c.type === 'group' && !mine && last.kind !== 'system' ? `${last.senderName.split(' ')[0]}: ${text}` : text;
  } else preview = c.type === 'self' ? 'Send notes, links and files to yourself' : 'Say hi 👋';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.name}${c.unread ? `, ${c.unread} unread` : ''}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceAlt }]}
    >
      <Avatar name={c.name} url={c.avatarUrl} kind={c.type === 'group' ? 'group' : 'person'} online={c.type === 'direct' && c.other?.online} size={52} />
      <View style={styles.body}>
        <View style={styles.top}>
          <T w="bold" numberOfLines={1} style={styles.name}>
            {c.name}
          </T>
          <T style={[styles.time, c.unread && !c.muted ? { color: C.accent } : null]}>{listStamp(last?.createdAt || c.updatedAt)}</T>
        </View>
        <View style={styles.bottom}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}>
            {locked ? <Feather name="lock" size={13} color={C.muted} /> : null}
            {!locked && !c.typing && mine && last?.kind !== 'system' ? <Ticks status={last?.status} /> : null}
            {!locked && !c.typing && last?.kind === 'call' ? (
              <Feather name="phone" size={13} color={last.body === 'ended' ? C.muted : C.danger} />
            ) : null}
            <T numberOfLines={1} style={[styles.preview, c.typing && !locked ? { color: C.accent, fontFamily: 'PlusJakartaSans_600SemiBold' } : null, last?.deleted ? { fontStyle: 'italic' } : null]}>
              {preview}
            </T>
          </View>
          <View style={styles.badges}>
            {c.favorite ? <Ionicons name="star" size={14} color={C.gold} accessibilityLabel="Favourite" /> : null}
            {c.muted ? <Feather name="bell-off" size={14} color={C.faint} accessibilityLabel="Muted" /> : null}
            {c.pinned ? <Ionicons name="pin" size={15} color={C.faint} accessibilityLabel="Pinned" /> : null}
            {c.unread ? (
              <View style={[styles.unread, c.muted && { backgroundColor: C.faint }]}>
                <T w="bold" style={{ color: '#FFFFFF', fontSize: 12 }}>
                  {c.unread > 99 ? '99+' : c.unread}
                </T>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 14 },
  body: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, paddingBottom: 12, paddingTop: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16.5, color: C.ink },
  time: { fontSize: 12.5, color: C.muted },
  bottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  preview: { flex: 1, color: C.muted, fontSize: 14.5 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
