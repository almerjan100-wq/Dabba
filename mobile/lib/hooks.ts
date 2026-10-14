import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

export function appIsActive() {
  if (Platform.OS === 'web') return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  return AppState.currentState === 'active';
}

/** Runs `fn` now and then every `ms` while enabled and the app is in the foreground. */
export function usePolling(fn: () => Promise<unknown> | unknown, ms: number, enabled = true, deps: unknown[] = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (appIsActive()) {
        try {
          await ref.current();
        } catch {
          /* keep polling */
        }
      }
      if (!stopped) timer = setTimeout(tick, ms);
    };
    tick();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !stopped) {
        clearTimeout(timer);
        tick();
      }
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ms, ...deps]);
}

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
