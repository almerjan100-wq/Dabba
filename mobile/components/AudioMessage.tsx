import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { mediaUri } from '@/lib/api';
import { duration } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { T, tap } from './ui';

const SPEEDS = [1, 1.5, 2];

export function AudioMessage({ url, durationMs, onDark }: { url: string | null; durationMs?: number | null; onDark?: boolean }) {
  const uri = mediaUri(url);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState(1);

  const totalMs = status.duration && status.duration > 0 && Number.isFinite(status.duration) ? status.duration * 1000 : durationMs || 0;
  const posMs = (status.currentTime || 0) * 1000;
  const progress = totalMs > 0 ? Math.min(1, posMs / totalMs) : 0;

  useEffect(() => {
    if (status.didJustFinish) {
      try {
        player.pause();
        player.seekTo(0);
      } catch {
        /* player released */
      }
    }
  }, [status.didJustFinish, player]);

  const toggle = () => {
    tap();
    try {
      if (status.playing) player.pause();
      else {
        if (totalMs && posMs >= totalMs - 250) player.seekTo(0);
        player.setPlaybackRate(rate);
        player.play();
      }
    } catch {
      /* not ready yet */
    }
  };

  const cycleSpeed = () => {
    tap('select');
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    try {
      player.setPlaybackRate(next);
    } catch {
      /* ignore */
    }
  };

  const fg = onDark ? C.bubbleMineText : C.ink;
  const track = onDark ? 'rgba(255,255,255,0.25)' : C.sunken;
  const fill = onDark ? C.gold : C.accent;
  const meta = onDark ? C.bubbleMineMeta : C.bubbleTheirsMeta;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        onPress={toggle}
        style={[styles.play, { backgroundColor: onDark ? 'rgba(255,255,255,0.12)' : C.accentSoft }]}
        hitSlop={6}
      >
        <Feather name={status.playing ? 'pause' : 'play'} size={20} color={onDark ? C.gold : C.accent} style={!status.playing ? { marginLeft: 2 } : undefined} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={[styles.track, { backgroundColor: track }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: fill }]} />
          <View style={[styles.knob, { left: `${progress * 100}%`, backgroundColor: fill }]} />
        </View>
        <View style={styles.row}>
          <T style={{ color: meta, fontSize: 12 }}>{duration(status.playing || posMs > 0 ? posMs : totalMs)}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={`Playback speed ${rate}x`} onPress={cycleSpeed} hitSlop={8} style={[styles.speed, { borderColor: meta }]}>
            <T w="bold" style={{ color: fg, fontSize: 11.5 }}>
              {rate}x
            </T>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 230, paddingVertical: 2 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, marginTop: 8, marginRight: 6 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  knob: { position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, marginLeft: -6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  speed: { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 1 },
});
