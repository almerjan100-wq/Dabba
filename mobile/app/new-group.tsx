import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api, errorText } from '@/lib/api';
import { useFriends } from '@/lib/friends';
import { refreshConversations } from '@/lib/store';
import { C, R } from '@/lib/theme';
import { goBack, Header } from '@/components/Header';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Overlay';
import { Btn, Empty, ErrorNote, Field, T } from '@/components/ui';

export default function NewGroup() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const addTo = add ? Number(add) : null;
  const { data } = useFriends();
  const [picked, setPicked] = useState<number[]>([]);
  const [step, setStep] = useState<'pick' | 'name'>('pick');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const friends = data?.friends || [];
  const chosen = friends.filter((f) => picked.includes(f.id));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (addTo) {
        await api(`/conversations/${addTo}/members`, { body: { memberIds: picked } });
        toast(`Added ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`);
        goBack(`/chat-info/${addTo}`);
      } else {
        const r = await api<{ id: number }>('/conversations/group', { body: { title: title.trim(), memberIds: picked } });
        refreshConversations().catch(() => {});
        router.replace(`/chat/${r.id}`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'name') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header back onBack={() => setStep('pick')} title="New group" subtitle={`${picked.length} member${picked.length === 1 ? '' : 's'} + you`} />
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <ErrorNote text={error} />
          <Field label="Group name" icon="users" value={title} onChangeText={setTitle} placeholder="e.g. Weekend plans" maxLength={60} autoFocus />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {chosen.map((f) => (
              <View key={f.id} style={styles.pill}>
                <Avatar name={f.displayName} url={f.avatarUrl} size={24} />
                <T w="semibold" style={{ fontSize: 13.5 }}>
                  {f.displayName}
                </T>
              </View>
            ))}
          </View>
          <Btn title="Create group" icon="check" onPress={submit} loading={busy} disabled={!title.trim()} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title={addTo ? 'Add members' : 'New group'} subtitle={picked.length ? `${picked.length} selected` : 'Pick friends to add'} />
      <ErrorNote text={error} />
      <FlatList
        data={friends}
        keyExtractor={(f) => String(f.id)}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={
          !data ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} /> : <Empty icon="users" title="No friends yet" text="Add friends first, then make a group with them." />
        }
        renderItem={({ item }) => {
          const on = picked.includes(item.id);
          return (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(item.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceAlt }]}>
              <Avatar name={item.displayName} url={item.avatarUrl} size={46} />
              <View style={{ flex: 1 }}>
                <T w="bold" style={{ fontSize: 16 }}>
                  {item.displayName}
                </T>
                <T style={{ color: C.muted, fontSize: 13.5 }}>@{item.username}</T>
              </View>
              <View style={[styles.check, on && { backgroundColor: C.accent, borderColor: C.accent }]}>{on ? <Feather name="check" size={15} color="#FFFFFF" /> : null}</View>
            </Pressable>
          );
        }}
      />
      {picked.length ? (
        <View style={styles.footer}>
          <Btn
            title={addTo ? `Add ${picked.length}` : 'Next'}
            icon={addTo ? 'user-plus' : 'arrow-right'}
            loading={busy}
            onPress={() => (addTo ? submit() : setStep('name'))}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, paddingRight: 12, paddingLeft: 4, paddingVertical: 4, borderRadius: R.pill },
});
