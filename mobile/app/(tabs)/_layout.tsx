import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '@/lib/theme';
import { useConversations } from '@/lib/store';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { conversations } = useConversations();
  const unreadChats = conversations.filter((c) => c.unread > 0 && !c.archived && !c.muted).length;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.line,
          height: 62 + (Platform.OS === 'web' ? 0 : insets.bottom),
          paddingBottom: Platform.OS === 'web' ? 8 : Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: F.semibold, fontSize: 12 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={23} color={color} />,
          tabBarBadge: unreadChats ? unreadChats : undefined,
          tabBarBadgeStyle: { backgroundColor: C.accent, color: '#FFFFFF', fontFamily: F.bold, fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{ title: 'Calls', tabBarIcon: ({ color }) => <Feather name="phone" size={22} color={color} /> }}
      />
    </Tabs>
  );
}
