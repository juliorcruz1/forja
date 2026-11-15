import { useEffect } from 'react';

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: 'screen') => Promise<WakeLockSentinel> };

/**
 * Keeps the screen on while `active` (Screen Wake Lock API, iOS 16.4+ in
 * installed PWAs). iOS drops the lock when the app is hidden, so it is
 * requested again when the app comes back. Silently does nothing if unsupported.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active || !wl) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await wl.request('screen');
        if (cancelled) await l.release();
        else lock = l;
      } catch {
        // Not allowed right now (e.g. low power mode): the timer still works from timestamps.
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') request();
    };
    request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => undefined);
    };
  }, [active]);
}
