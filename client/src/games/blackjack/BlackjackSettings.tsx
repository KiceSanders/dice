import type { BlackjackSettings } from '@dice/shared';
import { useEffect, useState } from 'react';
import { useApp } from '../../state/context';

export function BlackjackSettingsFields({
  value,
  onChange,
  disabled = false,
}: {
  value: BlackjackSettings;
  onChange?: (next: BlackjackSettings) => void;
  disabled?: boolean;
}) {
  return (
    <div className="settings-fields">
      <p>
        Two players · Target 21 · 10 chips per win. Every tie resets scores, switches to a
        twelve-sided die, and doubles the payout again. Payouts are limited to the losing stack.
      </p>
      {(
        [
          ['minBuyIn', 'Minimum buy-in', 1, 1_000_000],
          ['maxBuyIn', 'Maximum buy-in', value.minBuyIn, 10_000_000],
          ['afterRollDelayMs', 'Reveal delay (ms)', 0, 10_000],
        ] as const
      ).map(([key, label, min, max]) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <input
            type="number"
            min={min}
            max={max}
            step={1}
            disabled={disabled}
            value={value[key]}
            onChange={(event) => onChange?.({ ...value, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}

export function BlackjackSettingsPanel({
  settings,
  isHost,
}: {
  settings: BlackjackSettings;
  isHost: boolean;
}) {
  const { send, state } = useApp();
  const [draft, setDraft] = useState(settings);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);
  return (
    <details className="card settings-panel">
      <summary>Dice Blackjack settings{!isHost && ' (read-only)'}</summary>
      <BlackjackSettingsFields
        value={isHost ? draft : settings}
        disabled={!isHost}
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
