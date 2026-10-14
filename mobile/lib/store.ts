// Tiny shared cache for the chat list so every screen sees the same data.
import { useEffect, useReducer } from 'react';
import { api, Conversation } from './api';

let conversations: Conversation[] = [];
let loaded = false;
let inflight: Promise<Conversation[]> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function refreshConversations(): Promise<Conversation[]> {
  if (inflight) return inflight;
  inflight = api<{ conversations: Conversation[] }>('/conversations')
    .then((r) => {
      conversations = sortConversations(r.conversations);
      loaded = true;
      emit();
      return conversations;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function patchConversation(id: number, patch: Partial<Conversation>) {
  conversations = sortConversations(conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  emit();
}

export function getConversation(id: number) {
  return conversations.find((c) => c.id === id) || null;
}

let openChat: number | null = null;
export function setOpenChat(id: number | null) {
  openChat = id;
}
export function getOpenChat() {
  return openChat;
}

export function clearStore() {
  conversations = [];
  loaded = false;
  emit();
}

export function useConversations() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { conversations, loaded };
}
