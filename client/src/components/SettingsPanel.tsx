import type { RoomSettings, RoomSnapshot } from '@dice/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../state/context';
import SettingsFields, { fillEmptySettings } from './SettingsFields';

/**
 * Room settings: editable by the host anytime (lobby / playing / roundEnd),
 * read-only for everyone else. Chip amounts apply at the next ante / payout.
 */
export default function SettingsPanel({
  snapshot,
  isHost,
}: {
  snapshot: RoomSnapshot;
  isHost: boolean;
}) {
  const { send, state } = useApp();
  const connected = state.connection === 'open';
  const canEdit = isHost;
  const [draft, setDraft] = useState<RoomSettings>(snapshot.settings);
  const [dirty, setDirty] = useState(false);

  // Re-sync the draft whenever the authoritative settings change underneath us.
  useEffect(() => {
    if (!dirty) setDraft(snapshot.settings);
  }, [snapshot.settings, dirty]);

  function onChange(next: RoomSettings) {
    setDraft(next);
    setDirty(true);
  }

  function save() {
    const settings = fillEmptySettings(draft);
    setDraft(settings);
    if (send({ type: 'settings:update', settings })) setDirty(false);
  }

  return (
    <details className="card settings-panel">
      <summary>
        Room settings
        {!canEdit && <span className="muted"> (read-only)</span>}
      </summary>
      <SettingsFields
        value={canEdit ? draft : snapshot.settings}
        onChange={canEdit ? onChange : undefined}
        disabled={!canEdit}
      />
      {canEdit && (
        <div className="settings-actions">
          <button type="button" onClick={save} disabled={!dirty || !connected}>
            Save settings
          </button>
          {dirty && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft(snapshot.settings);
                setDirty(false);
              }}
            >
              Discard
            </button>
          )}
        </div>
      )}
    </details>
  );
}
