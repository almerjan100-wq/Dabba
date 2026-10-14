import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api, errorText, Me } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { C, R } from '@/lib/theme';
import { AuthShell } from '@/components/AuthShell';
import { Btn, ErrorNote, Field, T } from '@/components/ui';

export default function Forgot() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode = modeParam === 'username' ? 'username' : 'password';
  const { signIn } = useAuth();
  const [step, setStep] = useState<'email' | 'answer' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [password, setPassword] = useState('');
  const [found, setFound] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getQuestion = async () => {
    setError(null);
    if (!email.trim()) return setError('Enter the email on your account.');
    setBusy(true);
    try {
      const r = await api<{ question: string }>('/account/recover/question', { body: { email: email.trim() } });
      setQuestion(r.question);
      setStep('answer');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError(null);
    if (!answer.trim()) return setError('Type your answer.');
    if (mode === 'password' && password.length < 8) return setError('New password must be at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'username') {
        const r = await api<{ username: string }>('/account/recover/username', { body: { email: email.trim(), answer } });
        setFound(r.username);
        setStep('done');
      } else {
        const r = await api<{ token: string; member: Me }>('/account/recover/reset', { body: { email: email.trim(), answer, newPassword: password } });
        await signIn(r.token, r.member);
        router.replace('/chats');
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'username' ? 'Find your username' : 'Reset your password';
  return (
    <AuthShell back title={title} subtitle={step === 'email' ? 'Enter the email you signed up with. We’ll ask your security question.' : undefined}>
      <ErrorNote text={error} />
      {step === 'email' ? (
        <>
          <Field label="Email" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" onSubmitEditing={getQuestion} />
          <Btn title="Continue" onPress={getQuestion} loading={busy} />
        </>
      ) : null}
      {step === 'answer' ? (
        <>
          <View style={{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 14, flexDirection: 'row', gap: 10 }}>
            <Feather name="help-circle" size={18} color={C.accent} style={{ marginTop: 2 }} />
            <T w="semibold" style={{ flex: 1, color: C.ink, lineHeight: 21 }}>
              {question}
            </T>
          </View>
          <Field label="Your answer" icon="shield" value={answer} onChangeText={setAnswer} autoCapitalize="none" placeholder="Not case-sensitive" />
          {mode === 'password' ? (
            <Field label="New password" icon="lock" value={password} onChangeText={setPassword} secure autoCapitalize="none" placeholder="At least 8 characters" />
          ) : null}
          <Btn title={mode === 'password' ? 'Reset password & sign in' : 'Show my username'} onPress={finish} loading={busy} />
          <T style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 12 }}>After 5 wrong answers, recovery pauses for an hour.</T>
        </>
      ) : null}
      {step === 'done' ? (
        <>
          <View style={{ backgroundColor: C.surface, borderRadius: R.lg, padding: 18, alignItems: 'center', marginBottom: 16 }}>
            <T style={{ color: C.muted }}>Your username is</T>
            <T w="extrabold" style={{ fontSize: 26, color: C.ink, marginTop: 4 }} selectable>
              @{found}
            </T>
          </View>
          <Btn title="Back to sign in" onPress={() => router.replace('/login')} />
        </>
      ) : null}
    </AuthShell>
  );
}
