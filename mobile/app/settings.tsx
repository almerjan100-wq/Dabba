import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { api, errorText, Me, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useConversations, clearStore } from '@/lib/store';
import {
  bioAvailable,
  clearAppPin,
  getAppBio,
  hasAppPin,
  lockedChatIds,
  setAppBio,
  useLockState,
} from '@/lib/appLock';
import { C, R } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { goBack } from '@/components/Header';
import { Group, Row, SectionLabel } from '@/components/Rows';
import { PinModal } from '@/components/PinPad';
import { QuestionPicker } from '@/components/QuestionPicker';
import { actionSheet, alertDialog, confirmDialog, customSheet, promptDialog, toast } from '@/components/Overlay';
import { Btn, ErrorNote, Field, T, Toggle } from '@/components/ui';

function SecuritySheet({ me, close, onSaved }: { me: Me; close: () => void; onSaved: (m: Me) => void }) {
  const [question, setQuestion] = useState(me.securityQuestion || '');
  const [answer, setAnswer] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ member: Me }>('/account/security', { body: { question, answer, password } });
      onSaved(r.member);
      toast('Security question updated');
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <T w="bold" style={{ fontSize: 17, color: C.ink, marginBottom: 4 }}>
        Security question
      </T>
      <T style={{ color: C.muted, marginBottom: 14, lineHeight: 20 }}>Used to reset your password or find your username.</T>
      <ErrorNote text={error} />
      <QuestionPicker value={question} onChange={setQuestion} />
      <Field label="Answer" icon="shield" value={answer} onChangeText={setAnswer} autoCapitalize="none" placeholder="Not case-sensitive" />
      <Field label="Your password" icon="lock" value={password} onChangeText={setPassword} secure autoCapitalize="none" placeholder="Confirm it’s you" />
      <Btn title="Save" onPress={save} loading={busy} disabled={!question || !answer || !password} />
    </View>
  );
}

function PasswordSheet({ close }: { close: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    setBusy(true);
    setError(null);
    try {
      await api('/account/password', { body: { currentPassword: current, newPassword: next } });
      toast('Password changed. Other devices were signed out.');
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <T w="bold" style={{ fontSize: 17, color: C.ink, marginBottom: 14 }}>
        Change password
      </T>
      <ErrorNote text={error} />
      <Field label="Current password" icon="lock" value={current} onChangeText={setCurrent} secure autoCapitalize="none" />
      <Field label="New password" icon="key" value={next} onChangeText={setNext} secure autoCapitalize="none" placeholder="At least 8 characters" />
      <Btn title="Change password" onPress={save} loading={busy} disabled={!current || !next} />
    </View>
  );
}

function EmailSheet({ me, close, onSaved }: { me: Me; close: () => void; onSaved: (m: Me) => void }) {
  const [email, setEmail] = useState(me.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ member: Me }>('/account/email', { body: { email: email.trim(), password } });
      onSaved(r.member);
      toast('Email updated');
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ paddingHorizontal: 20 }}>
      <T w="bold" style={{ fontSize: 17, color: C.ink, marginBottom: 14 }}>
        Change email
      </T>
      <ErrorNote text={error} />
      <Field label="New email" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Your password" icon="lock" value={password} onChangeText={setPassword} secure autoCapitalize="none" placeholder="Confirm it’s you" />
      <Btn title="Save email" onPress={save} loading={busy} disabled={!email.trim() || !password} />
    </View>
  );
}

export default function Settings() {
  useLockState();
  const { me, setMe, signOut } = useAuth();
  const { conversations } = useConversations();
  const insets = useSafeAreaInsets();
  const [bio, setBio] = useState(false);
  const [pinFlow, setPinFlow] = useState<null | 'create' | 'change' | 'remove'>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    bioAvailable().then(setBio);
  }, []);

  if (!me) return null;
  const appPin = hasAppPin();
  const lockedCount = lockedChatIds().filter((id) => conversations.some((c) => c.id === id)).length;

  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try {
      const r = await api<{ member: Me }>('/account/me', { method: 'PATCH', body });
      setMe(r.member);
      if (msg) toast(msg);
    } catch (e) {
      toast(errorText(e));
    }
  };

  const editField = async (field: 'displayName' | 'about' | 'username') => {
    const conf = {
      displayName: { title: 'Your name', initial: me.displayName, max: 40 },
      about: { title: 'About', initial: me.about || '', max: 140 },
      username: { title: 'Username', initial: me.username, max: 20 },
    }[field];
    const value = await promptDialog({
      title: conf.title,
      initial: conf.initial,
      maxLength: conf.max,
      message: field === 'username' ? '3–20 lowercase letters, numbers or underscores. Friends find you by this.' : undefined,
    });
    if (value === null) return;
    patch({ [field]: field === 'username' ? value.trim().toLowerCase() : value.trim() }, 'Saved');
  };

  const changePhoto = () =>
    actionSheet({
      title: 'Profile photo',
      actions: [
        {
          label: 'Choose from gallery',
          icon: 'image',
          onPress: async () => {
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: Platform.OS !== 'web', aspect: [1, 1], quality: 0.85 });
            if (r.canceled || !r.assets?.[0]) return;
            setUploading(true);
            try {
              let uri = r.assets[0].uri;
              try {
                uri = (await manipulateAsync(uri, [{ resize: { width: 600 } }], { compress: 0.8, format: SaveFormat.JPEG })).uri;
              } catch {
                /* keep original */
              }
              const up = await uploadFile(uri, 'avatar.jpg', 'image/jpeg');
              await patch({ avatarUrl: up.url }, 'Photo updated');
            } catch (e) {
              toast(errorText(e));
            } finally {
              setUploading(false);
            }
          },
        },
        ...(me.avatarUrl ? [{ label: 'Remove photo', icon: 'trash-2' as const, danger: true, onPress: () => patch({ avatarUrl: null }, 'Photo removed') }] : []),
      ],
    });

  const clearEverything = async () => {
    const first = await confirmDialog({
      title: 'Clear everything?',
      message: 'This removes all your chats, groups, friends and requests from your account. Your login stays.',
      confirm: 'Continue',
      danger: true,
    });
    if (!first) return;
    const second = await confirmDialog({ title: 'Are you absolutely sure?', message: 'This cannot be undone.', confirm: 'Clear everything', danger: true });
    if (!second) return;
    try {
      await api('/account/clear-all', { body: {} });
      clearStore();
      toast('Everything was cleared');
      router.replace('/chats');
    } catch (e) {
      toast(errorText(e));
    }
  };

  const deleteAccount = async () => {
    const ok = await confirmDialog({
      title: 'Delete your account?',
      message: 'Your account, messages you sent, photos and voice notes will be permanently deleted. This cannot be undone.',
      confirm: 'Continue',
      danger: true,
    });
    if (!ok) return;
    const password = await promptDialog({ title: 'Enter your password', message: 'Confirm it’s really you.', secure: true, confirm: 'Delete forever' });
    if (!password) return;
    try {
      await api('/account/delete', { body: { password } });
      clearStore();
      await signOut({ remote: false, wipeLocks: true });
      await alertDialog('Account deleted', 'Your Dabba account has been removed.');
    } catch (e) {
      toast(errorText(e));
    }
  };

  const logout = async () => {
    const ok = await confirmDialog({ title: 'Log out?', message: 'Lock codes saved on this device will be removed.', confirm: 'Log out', danger: true });
    if (!ok) return;
    clearStore();
    await signOut({ remote: true, wipeLocks: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={[C.heroTop, C.heroMid, C.heroBottom]} style={[styles.hero, { paddingTop: insets.top + 8 }]}>
          <View style={styles.heroTop}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => goBack()} hitSlop={10} style={styles.back}>
              <Feather name="chevron-left" size={28} color="#FFFFFF" />
            </Pressable>
            <T w="bold" style={{ color: '#FFFFFF', fontSize: 18 }}>
              Settings
            </T>
            <View style={{ width: 42 }} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={changePhoto} style={{ marginTop: 6 }}>
            <Avatar name={me.displayName} url={me.avatarUrl} size={112} ring />
            <View style={styles.camera}>
              <Feather name={uploading ? 'loader' : 'camera'} size={16} color={C.ink} />
            </View>
          </Pressable>
          <T w="extrabold" style={styles.name}>
            {me.displayName}
          </T>
          <T style={{ color: C.gold, marginTop: 2 }}>@{me.username}</T>
          {me.about ? <T style={styles.about}>{me.about}</T> : null}
        </LinearGradient>

        <View style={{ height: 18 }} />
        <SectionLabel>Profile</SectionLabel>
        <Group>
          <Row icon="user" label="Name" value={me.displayName} onPress={() => editField('displayName')} chevron />
          <Row icon="feather" label="About" value={me.about || 'Add a line about you'} onPress={() => editField('about')} chevron />
          <Row icon="at-sign" label="Username" value={`@${me.username}`} onPress={() => editField('username')} chevron last />
        </Group>

        <SectionLabel>Account</SectionLabel>
        <Group>
          <Row icon="mail" label="Email" value={me.email || 'Not set'} onPress={() => customSheet((close) => <EmailSheet me={me} close={close} onSaved={setMe} />)} chevron />
          <Row icon="key" label="Change password" onPress={() => customSheet((close) => <PasswordSheet close={close} />)} chevron />
          <Row
            icon="help-circle"
            label="Security question"
            sublabel={me.securityQuestion || 'Not set — you can’t recover your account without it.'}
            onPress={() => customSheet((close) => <SecuritySheet me={me} close={close} onSaved={setMe} />)}
            chevron
            last
          />
        </Group>

        <SectionLabel>Privacy</SectionLabel>
        <Group>
          <Row
            icon="check-circle"
            label="Read receipts"
            sublabel="If off, you won’t send or see blue ticks."
            right={<Toggle value={me.readReceipts} onValueChange={(v) => patch({ readReceipts: v })} />}
          />
          <Row
            icon="eye-off"
            label="Hide message previews"
            sublabel="Alerts say “New message” instead of showing who or what."
            right={<Toggle value={me.hidePreviews} onValueChange={(v) => patch({ hidePreviews: v })} />}
            last
          />
        </Group>

        <SectionLabel>App lock</SectionLabel>
        <Group>
          <Row
            icon="lock"
            label="Lock Dabba with a PIN"
            sublabel={appPin ? 'Asked when Dabba opens or after 15 s away.' : 'Separate from your chat codes.'}
            right={<Toggle value={appPin} onValueChange={(v) => setPinFlow(v ? 'create' : 'remove')} />}
          />
          {appPin ? <Row icon="refresh-ccw" label="Change app PIN" onPress={() => setPinFlow('change')} chevron /> : null}
          {appPin ? (
            <Row
              icon="aperture"
              label="Unlock with fingerprint"
              sublabel={bio ? undefined : Platform.OS === 'web' ? 'Works in the installed app, not the browser.' : 'No fingerprint set up on this phone.'}
              right={<Toggle value={getAppBio()} disabled={!bio} onValueChange={(v) => setAppBio(v)} />}
            />
          ) : null}
          <Row icon="folder" label="Locked chats" value={String(lockedCount)} onPress={() => router.push('/locked')} chevron />
          <Row icon="shield" label="Security" sublabel="What protects your account and messages" onPress={() => router.push('/security')} chevron last />
        </Group>

        <SectionLabel>Chats</SectionLabel>
        <Group>
          <Row icon="star" label="Starred messages" onPress={() => router.push('/starred')} chevron />
          <Row icon="archive" label="Archived chats" onPress={() => router.push('/archived')} chevron />
          <Row icon="users" label="Friends & requests" onPress={() => router.push('/friends')} chevron last />
        </Group>

        <SectionLabel>About</SectionLabel>
        <Group>
          <Row icon="file-text" label="Privacy & terms" onPress={() => router.push('/legal')} chevron />
          <Row icon="info" label="Version" value="Dabba 1.0" last />
        </Group>

        <Group>
          <Row icon="trash" label="Clear everything" danger onPress={clearEverything} />
          <Row icon="user-x" label="Delete account" danger onPress={deleteAccount} last />
        </Group>

        <View style={{ paddingHorizontal: 16 }}>
          <Btn title="Log out" variant="danger" icon="log-out" onPress={logout} />
        </View>
      </ScrollView>

      <PinModal
        visible={pinFlow === 'create' || pinFlow === 'change'}
        mode={pinFlow === 'change' ? 'change' : 'create'}
        target={{ kind: 'app' }}
        onDone={(ok) => {
          if (ok) toast(pinFlow === 'change' ? 'App PIN changed' : 'App lock is on');
          setPinFlow(null);
        }}
      />
      <PinModal
        visible={pinFlow === 'remove'}
        mode="verify"
        target={{ kind: 'app' }}
        onDone={async (ok) => {
          if (ok) {
            await clearAppPin();
            toast('App lock is off');
          }
          setPinFlow(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 26, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 6 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  camera: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: C.heroMid,
  },
  name: { color: '#FFFFFF', fontSize: 26, marginTop: 14 },
  about: { color: '#E6DED1', marginTop: 8, textAlign: 'center', paddingHorizontal: 24 },
  card: { backgroundColor: C.surface, borderRadius: R.xl },
});
