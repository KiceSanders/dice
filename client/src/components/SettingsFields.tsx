import type { RoomSettings, StraightBonusConfig } from '@dice/shared';

interface Props {
  value: RoomSettings;
  onChange?: (settings: RoomSettings) => void;
  /** Read-only mode: every control disabled. */
  disabled?: boolean;
}

/**
 * Room settings form fields, shared by the create-room form (Home) and the
 * host settings panel (Room). Defaults and ranges come from PLAN.md.
 */
export default function SettingsFields({ value, onChange, disabled = false }: Props) {
  const set = (patch: Partial<RoomSettings>) => onChange?.({ ...value, ...patch });
  const setBonus = (patch: Partial<StraightBonusConfig>) =>
    onChange?.({ ...value, straightBonus: { ...value.straightBonus, ...patch } });

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
            checked={value.straightBonus.enabled}
            onChange={(e) => setBonus({ enabled: e.target.checked })}
          />
          Straight bonus
        </label>
        <small>Extra chips when a hand is a straight (1-2-3-4-5 or 2-3-4-5-6).</small>

        {value.straightBonus.enabled && (
          <div className="bonus-grid">
            <div className="field">
              <label htmlFor="set-bonus-type">Pays to</label>
              <select
                id="set-bonus-type"
                value={value.straightBonus.type}
                onChange={(e) => setBonus({ type: e.target.value as 'pot' | 'direct' })}
              >
                <option value="pot">the pot</option>
                <option value="direct">the player</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="set-bonus-base">Base amount</label>
              <input
                id="set-bonus-base"
                type="number"
                min={0}
                value={value.straightBonus.baseAmount}
                onChange={(e) =>
                  setBonus({ baseAmount: num(e.target.value, value.straightBonus.baseAmount) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="set-bonus-mult">Big multiplier</label>
              <input
                id="set-bonus-mult"
                type="number"
                min={1}
                value={value.straightBonus.multiplier}
                onChange={(e) =>
                  setBonus({ multiplier: num(e.target.value, value.straightBonus.multiplier) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="set-bonus-cap">Max bonus</label>
              <input
                id="set-bonus-cap"
                type="number"
                min={0}
                value={value.straightBonus.maxBonus}
                onChange={(e) =>
                  setBonus({ maxBonus: num(e.target.value, value.straightBonus.maxBonus) })
                }
              />
            </div>
            <label className="check bonus-incremental">
              <input
                type="checkbox"
                checked={value.straightBonus.incremental}
                onChange={(e) => setBonus({ incremental: e.target.checked })}
              />
              Incremental streak
            </label>
            <small className="field-help">
              Big straight pays base × multiplier. Incremental scales the payout by the consecutive-straight
              streak; max bonus caps any single payout.
            </small>
          </div>
        )}
      </div>
    </fieldset>
  );
}
