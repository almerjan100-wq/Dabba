import React from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { C, R } from '@/lib/theme';
import { actionSheet, promptDialog } from './Overlay';
import { T } from './ui';

export const QUESTIONS = [
  'What was the name of your first school?',
  'What city were you born in?',
  'What was the name of your first pet?',
  'What is your favourite food?',
  'Who was your childhood best friend?',
  "What is your mother's maiden name?",
];

export function QuestionPicker({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const pick = () =>
    actionSheet({
      title: 'Choose a security question',
      actions: [
        ...QUESTIONS.map((q) => ({ label: q, onPress: () => onChange(q) })),
        {
          label: 'Write my own question',
          icon: 'edit-3' as const,
          onPress: async () => {
            const own = await promptDialog({ title: 'Your own question', placeholder: 'e.g. My first car?', initial: value, confirm: 'Use it', maxLength: 120 });
            if (own && own.trim().length >= 5) onChange(own.trim());
          },
        },
      ],
    });
  return (
    <View style={{ marginBottom: 14 }}>
      <T w="semibold" style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>
        Security question
      </T>
      <Pressable
        accessibilityRole="button"
        onPress={pick}
        style={{
          minHeight: 52,
          backgroundColor: C.surface,
          borderRadius: R.lg,
          borderWidth: 1,
          borderColor: C.line,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Feather name="help-circle" size={18} color={C.muted} />
        <T w="medium" style={{ flex: 1, color: value ? C.text : C.faint, fontSize: 15.5, paddingVertical: 12 }}>
          {value || 'Pick a question'}
        </T>
        <Feather name="chevron-down" size={18} color={C.muted} />
      </Pressable>
    </View>
  );
}
