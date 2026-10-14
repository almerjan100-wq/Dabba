import React from 'react';
import { Linking, StyleProp, TextStyle } from 'react-native';
import { T } from './ui';

const SPLIT_RE = /(https?:\/\/[^\s<>"')\]]+)/gi;
const IS_URL = /^https?:\/\//i;

function highlightParts(text: string, term?: string) {
  if (!term) return [text];
  const out: Array<string | { hit: string }> = [];
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(t, i);
    if (j < 0) {
      out.push(text.slice(i));
      break;
    }
    if (j > i) out.push(text.slice(i, j));
    out.push({ hit: text.slice(j, j + t.length) });
    i = j + t.length;
  }
  return out;
}

export function LinkText({
  text,
  dark,
  style,
  highlight,
  trailing = 0,
}: {
  text: string;
  dark?: boolean;
  style?: StyleProp<TextStyle>;
  highlight?: string;
  trailing?: number; // px reserved at the end of the last line (for the time stamp)
}) {
  const parts = text.split(SPLIT_RE);
  return (
    <T style={style} selectable>
      {parts.map((p, i) =>
        IS_URL.test(p) ? (
          <T
            key={i}
            accessibilityRole="link"
            onPress={() => Linking.openURL(p).catch(() => {})}
            style={{ color: dark ? '#9FD3FF' : '#1D5FA8', textDecorationLine: 'underline' }}
          >
            {p}
          </T>
        ) : (
          highlightParts(p, highlight).map((h, k) =>
            typeof h === 'string' ? (
              <React.Fragment key={`${i}-${k}`}>{h}</React.Fragment>
            ) : (
              <T key={`${i}-${k}`} style={{ backgroundColor: dark ? '#7A5A1F' : '#FBE3A6' }}>
                {h.hit}
              </T>
            ),
          )
        ),
      )}
      {trailing > 0 ? <T style={{ fontSize: 11, color: 'transparent' }}>{'\u2002'.repeat(Math.ceil(trailing / 5.5))}</T> : null}
    </T>
  );
}
