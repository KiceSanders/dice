import { useEffect, useRef } from 'react';
import { useApp } from '../state/context';

const TOAST_TTL_MS = 6_000;

/** Fixed-position toast stack; each toast auto-dismisses after a few seconds. */
export default function Toasts() {
  const { state, dispatch } = useApp();
  const scheduled = useRef(new Set<number>());

  useEffect(() => {
    for (const toast of state.toasts) {
      if (scheduled.current.has(toast.id)) continue;
      scheduled.current.add(toast.id);
      setTimeout(() => dispatch({ type: 'dismiss-toast', id: toast.id }), TOAST_TTL_MS);
    }
  }, [state.toasts, dispatch]);

  if (state.toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {state.toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.text}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => dispatch({ type: 'dismiss-toast', id: t.id })}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
