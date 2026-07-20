import { useState } from 'react';
import { useApp } from '../state/context';
import type { ActivityLogEntry } from '../state/store';

export const ACTIVITY_LOG_PAGE_SIZE = 10;

export function visibleActivityEntries(
  entries: ActivityLogEntry[],
  visibleCount: number,
): ActivityLogEntry[] {
  return entries.slice(-visibleCount);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Collapsible game/activity history, kept separate from player conversation. */
export default function ActivityLogPanel() {
  const { state } = useApp();
  const entries = state.activityLog;
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_LOG_PAGE_SIZE);
  const hiddenCount = Math.max(0, entries.length - visibleCount);
  const visibleEntries = visibleActivityEntries(entries, visibleCount);

  return (
    <details className="card activity-log-panel">
      <summary>
        Game log <span className="muted">({entries.length})</span>
      </summary>

      {entries.length === 0 ? (
        <p className="muted activity-log-empty">Nothing has happened yet.</p>
      ) : (
        <div className="activity-log-list">
          {visibleEntries.map((entry, index) => (
            <p className="activity-log-line" key={`${entry.ts}-${index}`}>
              <span className="activity-log-time">{formatTime(entry.ts)}</span>
              <span>{entry.text}</span>
            </p>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          className="secondary activity-log-more"
          onClick={() => setVisibleCount((count) => count + ACTIVITY_LOG_PAGE_SIZE)}
        >
          Show {Math.min(ACTIVITY_LOG_PAGE_SIZE, hiddenCount)} more
        </button>
      )}
    </details>
  );
}
