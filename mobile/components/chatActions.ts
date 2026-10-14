import { router } from 'expo-router';
import { api, Conversation, errorText } from '@/lib/api';
import { patchConversation, refreshConversations } from '@/lib/store';
import { actionSheet, toast } from './Overlay';

async function setPrefs(c: Conversation, body: Record<string, unknown>, patch: Partial<Conversation>, done?: string) {
  patchConversation(c.id, patch);
  try {
    await api(`/conversations/${c.id}/prefs`, { body });
    if (done) toast(done);
  } catch (e) {
    toast(errorText(e));
  } finally {
    refreshConversations().catch(() => {});
  }
}

export function muteMenu(c: Conversation, after?: () => void) {
  return actionSheet({
    title: `Mute ${c.name}`,
    actions: [
      { label: '8 hours', icon: 'clock', onPress: () => setPrefs(c, { mute: '8h' }, { muted: true }, 'Muted for 8 hours').then(after) },
      { label: '1 week', icon: 'calendar', onPress: () => setPrefs(c, { mute: '1w' }, { muted: true }, 'Muted for 1 week').then(after) },
      { label: 'Always', icon: 'bell-off', onPress: () => setPrefs(c, { mute: 'always' }, { muted: true }, 'Muted').then(after) },
    ],
  });
}

export function chatLongPress(c: Conversation) {
  return actionSheet({
    title: c.name,
    actions: [
      c.pinned
        ? { label: 'Unpin chat', icon: 'minus-circle', onPress: () => setPrefs(c, { pinned: false }, { pinned: false, pinnedAt: null }) }
        : { label: 'Pin chat', icon: 'paperclip', onPress: () => setPrefs(c, { pinned: true }, { pinned: true, pinnedAt: new Date().toISOString() }) },
      c.favorite
        ? { label: 'Remove from favourites', icon: 'star', onPress: () => setPrefs(c, { favorite: false }, { favorite: false }, 'Removed from favourites') }
        : { label: 'Add to favourites', icon: 'star', onPress: () => setPrefs(c, { favorite: true }, { favorite: true }, 'Added to favourites') },
      c.muted
        ? { label: 'Unmute notifications', icon: 'bell', onPress: () => setPrefs(c, { mute: 'off' }, { muted: false }, 'Unmuted') }
        : { label: 'Mute notifications', icon: 'bell-off', onPress: () => muteMenu(c) },
      c.archived
        ? { label: 'Unarchive chat', icon: 'inbox', onPress: () => setPrefs(c, { archived: false }, { archived: false }, 'Chat unarchived') }
        : { label: 'Archive chat', icon: 'archive', onPress: () => setPrefs(c, { archived: true }, { archived: true, pinned: false }, 'Chat archived') },
      ...(c.unread && c.lastMessage
        ? [
            {
              label: 'Mark as read',
              icon: 'check-circle' as const,
              onPress: async () => {
                patchConversation(c.id, { unread: 0 });
                await api(`/conversations/${c.id}/read`, { body: { lastId: c.lastMessage!.id } }).catch(() => {});
              },
            },
          ]
        : []),
      { label: c.type === 'group' ? 'Group info' : 'Contact info', icon: 'info', onPress: () => router.push(`/chat-info/${c.id}`) },
    ],
  });
}
