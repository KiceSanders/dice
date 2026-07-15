import type {
  ClassicPotConfig,
  FirstRollYahtzeePayoutConfig,
  RoomSettings,
  StraightPayoutConfig,
  YahtzeeBonusConfig,
} from '@dice/shared';

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
  const setClassic = (patch: Partial<ClassicPotConfig>) =>
    onChange?.({ ...value, classicPot: { ...value.classicPot, ...patch } });
  const setYahtzee = (patch: Partial<YahtzeeBonusConfig>) =>
    onChange?.({ ...value, yahtzeeBonus: { ...value.yahtzeeBonus, ...patch } });
  const setFirstRollYahtzee = (patch: Partial<FirstRollYahtzeePayoutConfig>) =>
    onChange?.({
      ...value,
      firstRollYahtzeePayout: { ...value.firstRollYahtzeePayout, ...patch },
    });

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
        <small>
          Roll ceiling for the round's first player; later players are capped by the leader.
        </small>
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
      <small className="field-help">
        Players pick their own starting chips within these bounds.
      </small>

      <div className="settings-bonus">
        <label className="check">
          <input
            type="checkbox"
            checked={value.firstRollYahtzeePayout.enabled}
            onChange={(e) => setFirstRollYahtzee({ enabled: e.target.checked })}
          />
          First-roll Yahtzee payout
        </label>
        <small>
          A Yahtzee on the first roll, including one made with wilds, makes every other seated
          player pay the roller immediately.
        </small>

        {value.firstRollYahtzeePayout.enabled && (
          <div className="bonus-grid">
            <div className="field">
              <label htmlFor="set-first-roll-yahtzee-amount">Chips per player</label>
              <input
                id="set-first-roll-yahtzee-amount"
                type="number"
                min={0}
                value={value.firstRollYahtzeePayout.amountPerPlayer}
                onChange={(e) =>
                  setFirstRollYahtzee({
                    amountPerPlayer: num(
                      e.target.value,
                      value.firstRollYahtzeePayout.amountPerPlayer,
                    ),
                  })
                }
              />
            </div>
            <small className="field-help">
              This instant payout is separate from the Yahtzee bonus throw. Payments are capped by
              what a player has.
            </small>
          </div>
        )}
      </div>

      <div className="settings-bonus">
        <label className="check">
          <input
            type="checkbox"
            checked={value.straightPayout.enabled}
            onChange={(e) => setPayout({ enabled: e.target.checked })}
          />
          Straight payout
        </label>
        <small>
          Rolling a straight makes every other seated player pay the roller on the spot.
        </small>

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
            <small className="field-help">
              Each other seated player pays the base amount when a straight is rolled. Payments are
              capped by what a player has.
            </small>
          </div>
        )}
      </div>

      <div className="settings-bonus">
        <label className="check">
          <input
            type="checkbox"
            checked={value.classicPot.enabled}
            onChange={(e) => setClassic({ enabled: e.target.checked })}
          />
          Classic Pot
        </label>
        <small>
          First-roll four of a kind donates to a side pot; first-roll three 6s while setting the
          roll wins it.
        </small>

        {value.classicPot.enabled && (
          <div className="bonus-grid">
            <div className="field">
              <label htmlFor="set-classic-donation">Donation amount</label>
              <input
                id="set-classic-donation"
                type="number"
                min={0}
                value={value.classicPot.donationAmount}
                onChange={(e) =>
                  setClassic({
                    donationAmount: num(e.target.value, value.classicPot.donationAmount),
                  })
                }
              />
            </div>
            <small className="field-help">
              Chips moved from the roller into the Classic Pot on a first-roll four of a kind.
            </small>
          </div>
        )}
      </div>

      <div className="settings-bonus">
        <label className="check">
          <input
            type="checkbox"
            checked={value.yahtzeeBonus.enabled}
            onChange={(e) => setYahtzee({ enabled: e.target.checked })}
          />
          Yahtzee bonus
        </label>
        <small>
          Five of a kind earns a one-die bonus throw; matching the face makes every other seated
          player pay the roller.
        </small>

        {value.yahtzeeBonus.enabled && (
          <div className="bonus-grid">
            <div className="field">
              <label htmlFor="set-yahtzee-amount">Chips per player</label>
              <input
                id="set-yahtzee-amount"
                type="number"
                min={0}
                value={value.yahtzeeBonus.amountPerPlayer}
                onChange={(e) =>
                  setYahtzee({
                    amountPerPlayer: num(e.target.value, value.yahtzeeBonus.amountPerPlayer),
                  })
                }
              />
            </div>
            <small className="field-help">
              The bonus die must literally match the quint's face — a rolled 1 is not wild here.
              Payments are capped by what a player has.
            </small>
          </div>
        )}
      </div>
    </fieldset>
  );
}
