import type { BetALotSettings, RoomSnapshot } from '@dice/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../../state/context';
import BetALotSettingsFields from './BetALotSettingsFields';

type Props = { snapshot: RoomSnapshot; isHost: boolean };

/**
 * Bet-a-lot settings deliberately exposes the compact, high-signal controls.
 * The payout tables use their documented defaults and remain part of the
 * settings payload, so a future expanded editor does not alter room semantics.
 */
export default function BetALotSettingsPanel({ snapshot, isHost }: Props) {
  const { send, state } = useApp();
  const settings = snapshot.settings as BetALotSettings;
  const [draft, setDraft] = useState(settings);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);

  return (
    <details className="card settings-panel">
      <summary>
        Bet-a-lot settings
        {!isHost && <span className="muted"> (read-only)</span>}
      </summary>
      <BetALotSettingsFields
        disabled={!isHost}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setDirty(true);
        }}
      />
      {isHost && (
        <div className="settings-actions">
          <button
            type="button"
            disabled={!dirty || state.connection !== 'open'}
            onClick={() => {
              if (send({ type: 'settings:update', settings: draft })) setDirty(false);
            }}
          >
            Save settings
          </button>
          {dirty && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft(settings);
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
