import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Message, mediaUri } from '@/lib/api';
import { callLabel, duration, timeOf } from '@/lib/format';
import { C, R, senderColor } from '@/lib/theme';
import { AudioMessage } from './AudioMessage';
import { LinkText } from './LinkText';
import { Ticks } from './ChatRow';
import { T } from './ui';

type Props = {
  m: Message;
  mine: boolean;
  isGroup: boolean;
  firstInRun: boolean;
  dayText: string | null;
  highlight?: string;
  flash?: boolean;
  onLongPress: (m: Message) => void;
  onOpenImage: (url: string) => void;
  onReplyPress: (id: number) => void;
  onCallBack?: () => void;
  onRetry?: (m: Message) => void;
  onReactionsPress?: (m: Message) => void;
};

export const DayChip = ({ text }: { text: string }) => (
  <View style={styles.dayWrap}>
    <View style={styles.dayChip}>
      <T w="semibold" style={{ color: C.chipText, fontSize: 12.5 }}>
        {text}
      </T>
    </View>
  </View>
);

function ImageBody({ url, onOpen }: { url: string; onOpen: (u: string) => void }) {
  const [ratio, setRatio] = useState(1);
  const uri = mediaUri(url);
  if (!uri) return null;
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel="Photo. Tap to view." onPress={() => onOpen(uri)}>
      <Image
        source={{ uri }}
        style={{ width: 240, height: Math.round(240 / ratio), borderRadius: R.md, backgroundColor: C.sunken }}
        contentFit="cover"
        transition={150}
        onLoad={(e) => {
          const w = e.source?.width || 1;
          const h = e.source?.height || 1;
          setRatio(Math.max(0.6, Math.min(1.8, w / h)));
        }}
        accessibilityLabel="Photo"
      />
    </Pressable>
  );
}

function reactionSummary(m: Message) {
  const map = new Map<string, number>();
  for (const r of m.reactions) map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
  return Array.from(map.entries());
}

function Bubble({ m, mine, isGroup, firstInRun, dayText, highlight, flash, onLongPress, onOpenImage, onReplyPress, onCallBack, onRetry, onReactionsPress }: Props) {
  if (m.kind === 'system') {
    return (
      <View>
        {dayText ? <DayChip text={dayText} /> : null}
        <View style={styles.dayWrap}>
          <View style={[styles.dayChip, { backgroundColor: C.goldSoft, maxWidth: '86%' }]}>
            <T style={{ color: C.chipText, fontSize: 12.5, textAlign: 'center' }}>{m.body}</T>
          </View>
        </View>
      </View>
    );
  }

  const deleted = !!m.deletedAt;
  const dark = mine;
  const fg = dark ? C.bubbleMineText : C.bubbleTheirsText;
  const meta = dark ? C.bubbleMineMeta : C.bubbleTheirsMeta;
  const isMedia = m.kind === 'image' && !deleted;
  const missedCall = m.kind === 'call' && !mine && (m.body === 'missed' || m.body === 'cancelled');
  const reactions = reactionSummary(m);
  const metaText = `${m.editedAt && !deleted ? 'Edited  ' : ''}${timeOf(m.createdAt)}`;
  const trailing = metaText.length * 6.3 + (mine ? 20 : 0) + (m.starred ? 14 : 0) + (m.pinnedAt ? 14 : 0) + (m.expiresAt ? 13 : 0) + 10;
  const metaStatic = m.kind === 'audio' && !deleted;

  const metaRow = (
    <View style={[styles.meta, isMedia && !m.body ? styles.metaOnImage : null, metaStatic && styles.metaStatic]}>
      {m.starred ? <Ionicons name="star" size={11} color={isMedia && !m.body ? '#FFFFFF' : meta} /> : null}
      {m.pinnedAt ? <Ionicons name="pin" size={11} color={isMedia && !m.body ? '#FFFFFF' : meta} /> : null}
      {m.expiresAt ? <Feather name="clock" size={10} color={isMedia && !m.body ? '#FFFFFF' : meta} /> : null}
      <T style={{ color: isMedia && !m.body ? '#FFFFFF' : meta, fontSize: 11 }}>{metaText}</T>
      {mine && m.status ? <Ticks status={m.status} size={15} onDark={dark || (isMedia && !m.body)} /> : null}
    </View>
  );

  let content: React.ReactNode;
  if (deleted) {
    content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 64 }}>
        <Feather name="slash" size={14} color={meta} />
        <T style={{ color: meta, fontStyle: 'italic' }}>{mine ? 'You deleted this message' : 'This message was deleted'}</T>
      </View>
    );
  } else if (m.kind === 'image') {
    content = (
      <View>
        <ImageBody url={m.localUri || m.mediaUrl || ''} onOpen={onOpenImage} />
        {m.body ? (
          <View style={{ paddingTop: 6, paddingHorizontal: 2, maxWidth: 240 }}>
            <LinkText text={m.body} dark={dark} highlight={highlight} trailing={trailing} style={{ color: fg, fontSize: 15.5, lineHeight: 21 }} />
          </View>
        ) : null}
      </View>
    );
  } else if (m.kind === 'audio') {
    content = <AudioMessage url={m.localUri || m.mediaUrl} durationMs={m.durationMs} onDark={dark} />;
  } else if (m.kind === 'call') {
    content = (
      <Pressable accessibilityRole="button" onPress={onCallBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 54, minWidth: 180 }}>
        <View style={[styles.callIcon, { backgroundColor: missedCall ? C.dangerSoft : dark ? 'rgba(255,255,255,0.12)' : C.accentSoft }]}>
          <Feather name={missedCall ? 'phone-missed' : mine ? 'phone-outgoing' : 'phone-incoming'} size={17} color={missedCall ? C.danger : dark ? C.gold : C.accent} />
        </View>
        <View>
          <T w="semibold" style={{ color: fg }}>
            {callLabel(m.body, mine)}
          </T>
          <T style={{ color: meta, fontSize: 12.5 }}>{m.durationMs ? duration(m.durationMs) : missedCall ? 'Tap to call back' : 'Voice call'}</T>
        </View>
      </Pressable>
    );
  } else {
    content = (
      <LinkText
        text={m.body || ''}
        dark={dark}
        highlight={highlight}
        trailing={trailing}
        style={{ color: fg, fontSize: 15.5, lineHeight: 21.5 }}
      />
    );
  }

  const bubbleShape = mine
    ? { borderTopRightRadius: firstInRun ? 6 : 18 }
    : { borderTopLeftRadius: firstInRun ? 6 : 18 };

  return (
    <View style={{ marginTop: firstInRun ? 6 : 2 }}>
      {dayText ? <DayChip text={dayText} /> : null}
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', paddingHorizontal: 10 }}>
        <Pressable
          onLongPress={() => onLongPress(m)}
          onPress={m.status === 'failed' && onRetry ? () => onRetry(m) : undefined}
          delayLongPress={280}
          accessibilityHint="Long press for options"
          style={[
            styles.bubble,
            mine ? styles.mine : styles.theirs,
            bubbleShape,
            isMedia && { padding: 4 },
            flash && { borderWidth: 2, borderColor: C.gold },
          ]}
        >
          {isGroup && !mine && firstInRun ? (
            <T w="bold" style={{ color: senderColor(m.senderId), fontSize: 13, marginBottom: 2, paddingHorizontal: isMedia ? 4 : 0 }}>
              {m.senderName}
            </T>
          ) : null}
          {m.forwarded && !deleted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2, paddingHorizontal: isMedia ? 4 : 0 }}>
              <Feather name="corner-up-right" size={12} color={meta} />
              <T style={{ color: meta, fontSize: 12, fontStyle: 'italic' }}>Forwarded</T>
            </View>
          ) : null}
          {m.replyTo && !deleted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to replied message"
              onPress={() => onReplyPress(m.replyTo!.id)}
              style={[styles.quote, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : C.surfaceAlt, borderLeftColor: dark ? C.gold : senderColor(m.replyTo.senderId) }]}
            >
              <T w="bold" style={{ color: dark ? C.gold : senderColor(m.replyTo.senderId), fontSize: 12.5 }} numberOfLines={1}>
                {m.replyTo.senderName}
              </T>
              <T numberOfLines={2} style={{ color: dark ? C.bubbleMineMeta : C.muted, fontSize: 13 }}>
                {m.replyTo.deleted
                  ? 'Deleted message'
                  : m.replyTo.kind === 'image'
                    ? `📷 ${m.replyTo.body || 'Photo'}`
                    : m.replyTo.kind === 'audio'
                      ? '🎤 Voice message'
                      : m.replyTo.body}
              </T>
            </Pressable>
          ) : null}
          {content}
          {metaRow}
        </Pressable>
        {reactions.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See reactions"
            onPress={() => onReactionsPress?.(m)}
            style={[styles.reactions, mine ? { marginRight: 8 } : { marginLeft: 8 }]}
          >
            {reactions.map(([e, n]) => (
              <T key={e} style={{ fontSize: 14 }}>
                {e}
                {n > 1 ? <T w="semibold" style={{ fontSize: 12, color: C.muted }}>{` ${n}`}</T> : null}
              </T>
            ))}
          </Pressable>
        ) : null}
        {m.status === 'failed' ? (
          <T style={{ color: C.danger, fontSize: 12, marginTop: 3, marginRight: 6 }}>Not sent · tap to retry</T>
        ) : null}
      </View>
    </View>
  );
}

export const MessageBubble = memo(Bubble);

const styles = StyleSheet.create({
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  dayChip: { backgroundColor: C.chip, paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.md },
  bubble: { maxWidth: '84%', paddingHorizontal: 11, paddingTop: 7, paddingBottom: 6, borderRadius: 18 },
  mine: { backgroundColor: C.bubbleMine },
  theirs: { backgroundColor: C.bubbleTheirs, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', position: 'absolute', right: 10, bottom: 5 },
  metaStatic: { position: 'relative', right: 0, bottom: 0, marginTop: 2 },
  metaOnImage: { backgroundColor: 'rgba(0,0,0,0.38)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, right: 10, bottom: 10 },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6, minWidth: 140 },
  callIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: C.surface,
    borderRadius: R.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: -6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
});
