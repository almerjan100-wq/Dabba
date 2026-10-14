import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { setAudioModeAsync } from 'expo-audio';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { AuthProvider, useAuth } from '@/lib/session';
import { AppLockOverlay } from '@/components/AppLock';
import { OverlayHost } from '@/components/Overlay';
import { CallLayer } from '@/components/CallLayer';
import { MessageAlerts } from '@/components/MessageAlerts';
import { C } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PUBLIC = new Set(['login', 'signup', 'forgot']);

function Gate() {
  const { ready, me } = useAuth();
  const segments = useSegments();
  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    const isPublic = !!first && PUBLIC.has(first);
    if (!me && !isPublic && first) router.replace('/login');
    else if (me && isPublic) router.replace('/chats');
  }, [ready, me, segments]);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = 'Dabba';
  }, []);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#131210' : C.bg }}>
          <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: C.bg, overflow: 'hidden' } : { flex: 1 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: C.bg },
                animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
              }}
            />
            <Gate />
            <MessageAlerts />
            <CallLayer />
            <AppLockOverlay />
            <OverlayHost />
          </View>
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
