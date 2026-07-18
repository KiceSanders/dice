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

/** Empty number fields use NaN in the draft; call this before create/save. */
export function fillEmptySettings(s: RoomSettings): RoomSettings {
  const z = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    ...s,
    chipsPerRound: z(s.chipsPerRound),
    maxRolls: z(s.maxRolls),
    afterRollDelayMs: z(s.afterRollDelayMs),
    minBuyIn: z(s.minBuyIn),
    maxBuyIn: z(s.maxBuyIn),
    straightPayout: {
      ...s.straightPayout,
      amountPerPlayer: z(s.straightPayout.amountPerPlayer),
    },
    classicPot: {
      ...s.classicPot,
      donationAmount: z(s.classicPot.donationAmount),
    },
    yahtzeeBonus: {
      ...s.yahtzeeBonus,
      amountPerPlayer: z(s.yahtzeeBonus.amountPerPlayer),
    },
    firstRollYahtzeePayout: {
      ...s.firstRollYahtzeePayout,
      amountPerPlayer: z(s.firstRollYahtzeePayout.amountPerPlayer),
    },
  };
}

function parseNum(raw: string): number | null {
  if (raw === '') return Number.NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function displayNum(n: number): number | '' {
  return Number.isFinite(n) ? n : '';
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

  const onNum = (raw: string, apply: (n: number) => void) => {
    const n = parseNum(raw);
    if (n !== null) apply(n);
  };

  return (
    <fieldset className="settings-fields" disabled={disabled}>
      <div className="field">
        <label htmlFor="set-chips">Chips per round</label>
        <input
          id="set-chips"
          type="number"
          min={1}
          value={displayNum(value.chipsPerRound)}
          onChange={(e) => onNum(e.target.value, (n) => set({ chipsPerRound: n }))}
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
          value={displayNum(value.maxRolls)}
          onChange={(e) => onNum(e.target.value, (n) => set({ maxRolls: n }))}
        />
        <small>
          Roll ceiling for the round's first player; later players are capped by the leader.
        </small>
      </div>

      <div className="field">
        <label htmlFor="set-after-roll-delay">After Roll Delay (ms)</label>
        <input
          id="set-after-roll-delay"
          type="number"
          min={0}
          max={10000}
          step={100}
          value={displayNum(value.afterRollDelayMs)}
          onChange={(e) => onNum(e.target.value, (n) => set({ afterRollDelayMs: n }))}
        />
        <small>Time to inspect settled dice before payouts, effects, or turn changes.</small>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="set-minbuyin">Min buy-in</label>
          <input
            id="set-minbuyin"
            type="number"
            min={1}
            value={displayNum(value.minBuyIn)}
            onChange={(e) => onNum(e.target.value, (n) => set({ minBuyIn: n }))}
          />
        </div>
        <div className="field">
          <label htmlFor="set-maxbuyin">Max buy-in</label>
          <input
            id="set-maxbuyin"
            type="number"
            min={1}
            value={displayNum(value.maxBuyIn)}
            onChange={(e) => onNum(e.target.value, (n) => set({ maxBuyIn: n }))}
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
                value={displayNum(value.firstRollYahtzeePayout.amountPerPlayer)}
                onChange={(e) =>
                  onNum(e.target.value, (n) => setFirstRollYahtzee({ amountPerPlayer: n }))
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
                value={displayNum(value.straightPayout.amountPerPlayer)}
                onChange={(e) => onNum(e.target.value, (n) => setPayout({ amountPerPlayer: n }))}
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
                value={displayNum(value.classicPot.donationAmount)}
                onChange={(e) => onNum(e.target.value, (n) => setClassic({ donationAmount: n }))}
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
                value={displayNum(value.yahtzeeBonus.amountPerPlayer)}
                onChange={(e) => onNum(e.target.value, (n) => setYahtzee({ amountPerPlayer: n }))}
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
