// In-app alerts for new messages in chats you're not looking at.
// Respects mute, locked chats and the "Hide message previews" setting.
import { useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { useAuth } from '@/lib/session';
import { getOpenChat, refreshConversations, useConversations } from '@/lib/store';
import { isChatLocked } from '@/lib/appLock';
import { usePolling } from '@/lib/hooks';
import { previewText } from '@/lib/format';
import { toast } from './Overlay';

export function MessageAlerts() {
  const { me } = useAuth();
  const { conversations, loaded } = useConversations();
  const seen = useRef<Map<number, number> | null>(null);

  usePolling(() => refreshConversations(), 6000, !!me);

  useEffect(() => {
    if (!me) {
      seen.current = null;
      return;
    }
    if (!loaded) return;
    const next = new Map(conversations.map((c) => [c.id, c.lastMessage?.id || 0]));
    if (seen.current) {
      for (const c of conversations) {
        const last = c.lastMessage;
        const before = seen.current.get(c.id) || 0;
        if (!last || last.id <= before || last.senderId === me.id || last.kind === 'system') continue;
        if (c.muted || c.id === getOpenChat() || !c.unread) continue;
        const locked = isChatLocked(c.id);
        const text =
          me.hidePreviews || locked
            ? 'New message'
            : `${c.type === 'group' ? `${last.senderName.split(' ')[0]} in ${c.name}` : c.name}: ${previewText(last.kind, last.body, last.deleted, last.durationMs)}`;
        toast(text.length > 90 ? `${text.slice(0, 88)}…` : text);
        if (Platform.OS !== 'web') Vibration.vibrate(60);
        break;
      }
    }
    seen.current = next;
  }, [conversations, loaded, me]);

  return null;
}
