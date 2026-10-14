import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/lib/theme';

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <View
      accessibilityLabel="Dabba logo"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: C.gold,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="chatbubble-ellipses" size={size * 0.52} color={C.ink} />
    </View>
  );
}
