import { useRef } from 'react';

/**
 * Tap and long-press both run `action` (long press fires after `ms` without
 * waiting for the finger to lift). Also blocks iOS's text-selection callout.
 */
export function useLongPress(action: () => void, ms = 450) {
  const timer = useRef<number>();
  const fired = useRef(false);
  const clear = () => window.clearTimeout(timer.current);
  return {
    onTouchStart: () => {
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        action();
      }, ms);
    },
    onTouchMove: clear,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      if (!fired.current) action();
    },
    onClick: () => {
      clear();
      if (fired.current) {
        fired.current = false; // already opened by the long press
        return;
      }
      action();
    },
    style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as const,
  };
}
