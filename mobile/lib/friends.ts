import { useCallback, useEffect, useState } from 'react';
import { api, Person } from './api';

export type FriendPerson = Person & { requestId: number; requestedAt: string };
export type FriendsData = { friends: FriendPerson[]; incoming: FriendPerson[]; outgoing: FriendPerson[]; blocked: Person[] };

export function useFriends() {
  const [data, setData] = useState<FriendsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<FriendsData>('/friends'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

export async function openDirectChat(memberId: number): Promise<number> {
  const r = await api<{ id: number }>('/conversations/direct', { body: { memberId } });
  return r.id;
}
