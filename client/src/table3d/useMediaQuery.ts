import { useCallback, useSyncExternalStore } from 'react';

/**
 * Below this width the seat cards leave the overlay ellipse and stack under
 * the canvas (`.table-3d--stacked` / `.seat-strip` in index.css — keep this
 * literal in sync with that `@media (max-width: 640px)` block).
 */
export const SEAT_STACK_QUERY = '(max-width: 640px)';

/** Reactive matchMedia subscription. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
