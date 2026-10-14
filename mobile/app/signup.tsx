import React, { useState } from 'react';
import { router } from 'expo-router';
import { api, errorText, Me } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { C } from '@/lib/theme';
import { AuthShell } from '@/components/AuthShell';
import { QuestionPicker, QUESTIONS } from '@/components/QuestionPicker';
import { Btn, ErrorNote, Field, T } from '@/components/ui';

export default function Signup() {
  const { signIn } = useAuth();
  const [f, setF] = useState({ inviteCode: '', displayName: '', username: '', email: '', password: '', securityQuestion: QUESTIONS[0], securityAnswer: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!f.inviteCode.trim()) return setError('Enter the invite code you were given.');
    if (!f.displayName.trim()) return setError('Enter your name.');
    if (!/^[a-z0-9_]{3,20}$/.test(f.username.trim().toLowerCase())) return setError('Username must be 3–20 lowercase letters, numbers or underscores.');
    if (f.password.length < 8) return setError('Password must be at least 8 characters.');
    if (!f.securityAnswer.trim()) return setError('Answer your security question — it’s how you recover your account.');
    setBusy(true);
    try {
      const r = await api<{ token: string; member: Me }>('/account/signup', {
        body: { ...f, username: f.username.trim().toLowerCase(), email: f.email.trim() },
      });
      await signIn(r.token, r.member);
      router.replace('/chats');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell back title="Create your account" subtitle="Dabba is invite-only. Ask the person who invited you for the code.">
      <ErrorNote text={error} />
      <Field label="Invite code" icon="key" value={f.inviteCode} onChangeText={set('inviteCode')} autoCapitalize="characters" autoCorrect={false} placeholder="DABBA-XXXXXX" />
      <Field label="Your name" icon="user" value={f.displayName} onChangeText={set('displayName')} placeholder="How friends will see you" maxLength={40} autoComplete="name" />
      <Field
        label="Username"
        icon="at-sign"
        value={f.username}
        onChangeText={(v) => set('username')(v.toLowerCase().replace(/\s/g, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. arham_99"
        maxLength={20}
        hint="Friends find you by this exact username. 3–20 lowercase letters, numbers or _."
      />
      <Field label="Email" icon="mail" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
      <Field label="Password" icon="lock" value={f.password} onChangeText={set('password')} secure autoCapitalize="none" autoComplete="new-password" placeholder="At least 8 characters" />
      <QuestionPicker value={f.securityQuestion} onChange={set('securityQuestion')} />
      <Field label="Answer" icon="shield" value={f.securityAnswer} onChangeText={set('securityAnswer')} autoCapitalize="none" placeholder="Not case-sensitive" maxLength={100} />
      <Btn title="Create account" onPress={submit} loading={busy} style={{ marginTop: 6 }} />
      <T style={{ color: C.muted, fontSize: 12.5, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
        By creating an account you agree to the Privacy & Terms shown in Settings.
      </T>
    </AuthShell>
  );
}
