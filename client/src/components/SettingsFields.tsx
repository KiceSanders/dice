import type { RoomSettings, StraightPayoutConfig } from '@dice/shared';

interface Props {
  value: RoomSettings;
  onChange?: (settings: RoomSettings) => void;
  /** Read-only mode: every control disabled. */
  disabled?: boolean;
}

/**
 * Room settings form fields, shared by the create-room form (Home) and the
 * host settings panel (Room). Defaults and ranges: docs/GAME_RULES.md.
 */
export default function SettingsFields({ value, onChange, disabled = false }: Props) {
  const set = (patch: Partial<RoomSettings>) => onChange?.({ ...value, ...patch });
  const setPayout = (patch: Partial<StraightPayoutConfig>) =>
    onChange?.({ ...value, straightPayout: { ...value.straightPayout, ...patch } });

  const num = (raw: string, fallback: number): number => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <fieldset className="settings-fields" disabled={disabled}>
      <div className="field">
        <label htmlFor="set-chips">Chips per round</label>
        <input
          id="set-chips"
          type="number"
          min={1}
          value={value.chipsPerRound}
          onChange={(e) => set({ chipsPerRound: num(e.target.value, value.chipsPerRound) })}
        />
        <small>Ante every seated player pays into the pot each round.</small>
      </div>

      <div className="field">
        <label htmlFor="set-maxrolls">Max rolls</label>
        <input
          id="set-maxrolls"
          type="number"
          min={1}
          max={10}
          value={value.maxRolls}
          onChange={(e) => set({ maxRolls: num(e.target.value, value.maxRolls) })}
        />
        <small>Roll ceiling for the round's first player; later players are capped by the leader.</small>
      </div>

      <div className="field">
        <label htmlFor="set-maxplayers">Max players</label>
        <input
          id="set-maxplayers"
          type="number"
          min={2}
          max={3}
          value={value.maxPlayers}
          onChange={(e) => set({ maxPlayers: num(e.target.value, value.maxPlayers) })}
        />
        <small>Seats at the table (2–3). Extra joiners spectate.</small>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="set-minbuyin">Min buy-in</label>
          <input
            id="set-minbuyin"
            type="number"
            min={1}
            value={value.minBuyIn}
            onChange={(e) => set({ minBuyIn: num(e.target.value, value.minBuyIn) })}
          />
        </div>
        <div className="field">
          <label htmlFor="set-maxbuyin">Max buy-in</label>
          <input
            id="set-maxbuyin"
            type="number"
            min={1}
            value={value.maxBuyIn}
            onChange={(e) => set({ maxBuyIn: num(e.target.value, value.maxBuyIn) })}
          />
        </div>
      </div>
      <small className="field-help">Players pick their own starting chips within these bounds.</small>

      <div className="settings-bonus">
        <label className="check">
          <input
            type="checkbox"
            checked={value.straightPayout.enabled}
            onChange={(e) => setPayout({ enabled: e.target.checked })}
          />
          Straight payout
        </label>
        <small>Rolling a straight makes every other seated player pay the roller on the spot.</small>

        {value.straightPayout.enabled && (
          <div className="bonus-grid">
            <div className="field">
              <label htmlFor="set-payout-amount">Chips per player</label>
              <input
                id="set-payout-amount"
                type="number"
                min={0}
                value={value.straightPayout.amountPerPlayer}
                onChange={(e) =>
                  setPayout({
                    amountPerPlayer: num(e.target.value, value.straightPayout.amountPerPlayer),
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="set-payout-mult">Big multiplier</label>
              <input
                id="set-payout-mult"
                type="number"
                min={1}
                value={value.straightPayout.bigMultiplier}
                onChange={(e) =>
                  setPayout({
                    bigMultiplier: num(e.target.value, value.straightPayout.bigMultiplier),
                  })
                }
              />
            </div>
            <small className="field-help">
              Little straight (1-2-3-4-5): each player pays the base amount. Big straight
              (2-3-4-5-6): base × multiplier. Payments are capped by what a player has.
            </small>
          </div>
        )}
      </div>
    </fieldset>
  );
}
