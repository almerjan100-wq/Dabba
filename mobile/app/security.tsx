import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api, errorText, Me } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { bioAvailable, getAppBio, hasAppPin, lockedChatIds, useLockState } from '@/lib/appLock';
import { C, R } from '@/lib/theme';
import { Header } from '@/components/Header';
import { Group, Row, SectionLabel } from '@/components/Rows';
import { toast } from '@/components/Overlay';
import { T, Toggle } from '@/components/ui';

function Item({ icon, title, text }: { icon: keyof typeof Feather.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemIcon}>
        <Feather name={icon} size={17} color={C.success} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" style={{ color: C.ink }}>
          {title}
        </T>
        <T style={{ color: C.muted, fontSize: 13.5, lineHeight: 19, marginTop: 2 }}>{text}</T>
      </View>
    </View>
  );
}

export default function Security() {
  useLockState();
  const { me, setMe } = useAuth();
  const [bio, setBio] = useState(false);
  useEffect(() => {
    bioAvailable().then(setBio);
  }, []);
  if (!me) return null;

  const setHide = async (v: boolean) => {
    try {
      const r = await api<{ member: Me }>('/account/me', { method: 'PATCH', body: { hidePreviews: v } });
      setMe(r.member);
    } catch (e) {
      toast(errorText(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title="Security" />
      <ScrollView contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40 }}>
        <View style={styles.warn}>
          <Feather name="alert-triangle" size={20} color={C.warnText} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <T w="bold" style={{ color: C.warnText, fontSize: 15.5 }}>
              Not end-to-end encrypted
            </T>
            <T style={{ color: C.warnText, marginTop: 4, lineHeight: 20, fontSize: 13.5 }}>
              Messages are encrypted while travelling (HTTPS) and stored privately on Dabba’s server, but the server can technically read them. That’s what makes search,
              export and syncing work. Don’t share passwords, bank or ID details here.
            </T>
          </View>
        </View>

        <SectionLabel>Always on</SectionLabel>
        <Group style={{ paddingVertical: 4 }}>
          <Item icon="lock" title="Encrypted connection" text="Everything between your phone and Dabba travels over HTTPS." />
          <Item icon="key" title="Passwords are hashed" text="Your password is stored as a salted scrypt hash — nobody can read it, not even Dabba." />
          <Item icon="user-check" title="Invite-only sign-up" text="New accounts need the private invite code. There’s no public directory of users." />
          <Item icon="shield" title="Brute-force protection" text="Too many wrong passwords or recovery answers pauses sign-in for that account." />
          <Item icon="clock" title="Sessions expire" text="You stay signed in while you use Dabba; unused sessions end after 180 days." />
          <Item icon="file" title="Safe uploads" text="Only real photos and voice notes are accepted — files that could carry scripts are rejected." />
        </Group>

        <SectionLabel>On this device</SectionLabel>
        <Group>
          <Row icon="smartphone" label="App lock" value={hasAppPin() ? 'On' : 'Off'} onPress={() => router.push('/settings')} chevron />
          <Row
            icon="aperture"
            label="Fingerprint unlock"
            value={Platform.OS === 'web' ? 'App only' : !bio ? 'Not set up' : getAppBio() ? 'On' : 'Off'}
            onPress={() => router.push('/settings')}
            chevron
          />
          <Row icon="folder" label="Locked chats" value={String(lockedChatIds().length)} onPress={() => router.push('/locked')} chevron last />
        </Group>

        <SectionLabel>Notifications</SectionLabel>
        <Group>
          <Row
            icon="eye-off"
            label="Hide message previews"
            sublabel="Alerts say “New message” without the sender or text. Locked chats never show previews."
            right={<Toggle value={me.hidePreviews} onValueChange={setHide} />}
            last
          />
        </Group>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  warn: { flexDirection: 'row', gap: 12, backgroundColor: C.warnBg, marginHorizontal: 16, marginBottom: 18, padding: 16, borderRadius: R.xl, borderWidth: 1, borderColor: '#F3D9AE' },
  item: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  itemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E7F3E8', alignItems: 'center', justifyContent: 'center' },
});
