import React from 'react';
import { ScrollView, View } from 'react-native';
import { C, R } from '@/lib/theme';
import { Header } from '@/components/Header';
import { T } from '@/components/ui';

const SECTIONS: Array<[string, string]> = [
  [
    'What Dabba is',
    'Dabba is a private, invite-only messenger for a small circle of friends. It is run by the person who invited you, not by a large company.',
  ],
  [
    'What we store',
    'Your name, username, email, a hashed password, a hashed security answer, your profile photo and about line, your friends list, and the messages, photos and voice notes you send. We also keep basic records needed to run the service, such as when you were last online and call history.',
  ],
  [
    'Encryption',
    'Messages are encrypted in transit with HTTPS and stored on our server. Dabba is not end-to-end encrypted: the server can technically access message content. Please don’t send passwords, banking details or ID documents.',
  ],
  [
    'Who can see your messages',
    'Only the people in a chat can see its messages in the app. Deleting a message “for everyone” removes its content from the server. Clearing a chat only hides it for you.',
  ],
  [
    'Disappearing messages',
    'When turned on in a chat, new messages are deleted from the server after the chosen time.',
  ],
  [
    'Your controls',
    'You can change your details, clear all your chats and friends, or permanently delete your account at any time in Settings. Deleting your account removes your profile, sessions, uploaded media and the messages you sent.',
  ],
  [
    'Acceptable use',
    'Don’t use Dabba to harass people, share illegal content, or try to break into other accounts. Accounts that do may be removed.',
  ],
  [
    'No warranty',
    'Dabba is provided as-is for personal use between friends. Keep your own copy of anything important (Export chat helps).',
  ],
];

export default function Legal() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back title="Privacy & terms" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {SECTIONS.map(([title, text]) => (
          <View key={title} style={{ backgroundColor: C.surface, borderRadius: R.xl, padding: 16, marginBottom: 12 }}>
            <T w="bold" style={{ fontSize: 16, color: C.ink, marginBottom: 6 }}>
              {title}
            </T>
            <T style={{ color: C.text, lineHeight: 22 }}>{text}</T>
          </View>
        ))}
        <T style={{ color: C.muted, textAlign: 'center', marginTop: 8, fontSize: 13 }}>Last updated October 2026</T>
      </ScrollView>
    </View>
  );
}
