import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/session';
import { C } from '@/lib/theme';
import { Logo } from '@/components/Logo';

export default function Index() {
  const { ready, me } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.header, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <Logo size={72} />
        <ActivityIndicator color={C.gold} />
      </View>
    );
  }
  return <Redirect href={me ? '/chats' : '/login'} />;
}
