import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api, errorText, Me } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { C } from '@/lib/theme';
import { AuthShell, authStyles } from '@/components/AuthShell';
import { Btn, ErrorNote, Field, T } from '@/components/ui';

export default function Login() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your username (or email) and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; member: Me }>('/account/login', { body: { identifier: identifier.trim(), password } });
      await signIn(r.token, r.member);
      router.replace('/chats');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in with your username or email.">
      <ErrorNote text={error} />
      <Field
        label="Username or email"
        icon="at-sign"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        placeholder="yourname or you@example.com"
        returnKeyType="next"
      />
      <Field
        label="Password"
        icon="lock"
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        placeholder="Your password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Btn title="Sign in" onPress={submit} loading={busy} style={{ marginTop: 6 }} />
      <View style={authStyles.linkRow}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/forgot?mode=password')} hitSlop={8}>
          <T w="semibold" style={{ color: C.accent }}>
            Forgot password?
          </T>
        </Pressable>
        <T style={{ color: C.faint }}>·</T>
        <Pressable accessibilityRole="link" onPress={() => router.push('/forgot?mode=username')} hitSlop={8}>
          <T w="semibold" style={{ color: C.accent }}>
            Forgot username?
          </T>
        </Pressable>
      </View>
      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 22 }} />
      <T style={{ textAlign: 'center', color: C.muted, marginBottom: 10 }}>New to Dabba? You’ll need an invite code.</T>
      <Btn title="Create an account" variant="secondary" onPress={() => router.push('/signup')} />
    </AuthShell>
  );
}
