import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { mediaUri } from '@/lib/api';
import { initials } from '@/lib/format';
import { avatarColor, C } from '@/lib/theme';
import { T } from './ui';

type Props = {
  name: string;
  url?: string | null;
  size?: number;
  kind?: 'person' | 'group' | 'self';
  online?: boolean;
  ring?: boolean;
};

export function Avatar({ name, url, size = 46, kind = 'person', online, ring }: Props) {
  const uri = mediaUri(url);
  const ringPad = ring ? 3 : 0;
  const inner = size - ringPad * 2;
  const body = uri ? (
    <Image
      source={{ uri }}
      style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: C.sunken }}
      contentFit="cover"
      accessibilityLabel={`${name}'s profile picture`}
      transition={120}
    />
  ) : (
    <View
      style={{
        width: inner,
        height: inner,
        borderRadius: inner / 2,
        backgroundColor: kind === 'group' ? '#3E5C58' : avatarColor(name || '?'),
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={`${name} avatar`}
    >
      {kind === 'group' ? (
        <Feather name="users" size={inner * 0.42} color="#FFFFFF" />
      ) : (
        <T w="bold" style={{ color: '#FFFFFF', fontSize: inner * 0.38 }}>
          {initials(name)}
        </T>
      )}
    </View>
  );
  return (
    <View style={{ width: size, height: size }}>
      {ring ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, padding: ringPad, backgroundColor: C.gold }}>{body}</View>
      ) : (
        body
      )}
      {online ? (
        <View
          accessibilityLabel="online"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: Math.max(12, size * 0.26),
            height: Math.max(12, size * 0.26),
            borderRadius: 99,
            backgroundColor: C.online,
            borderWidth: 2,
            borderColor: '#FFFFFF',
          }}
        />
      ) : null}
    </View>
  );
}
