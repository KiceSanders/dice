import type { BetALotSettings } from '@dice/shared';

type Props = {
  value: BetALotSettings;
  onChange?: (value: BetALotSettings) => void;
  disabled?: boolean;
};

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        disabled={disabled}
        min={0}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/** Host-editable Bet-a-lot payout table. */
export default function BetALotSettingsFields({ value, onChange, disabled = false }: Props) {
  const patch = (next: Partial<BetALotSettings>) => onChange?.({ ...value, ...next });
  const payout = <
    K extends 'lossPayouts' | 'straightPayouts' | 'allSamePayouts' | 'allSameExtraPayouts',
  >(
    key: K,
    rung: keyof BetALotSettings[K],
    amount: number,
  ) => {
    patch({ [key]: { ...value[key], [rung]: amount } } as Partial<BetALotSettings>);
  };

  return (
    <div className="settings-fields betalot-settings-fields">
      <h3>Bet-a-lot stakes</h3>
      <NumberField
        label="Minimum buy-in"
        value={value.minBuyIn}
        disabled={disabled}
        onChange={(minBuyIn) => patch({ minBuyIn })}
      />
      <NumberField
        label="Maximum buy-in"
        value={value.maxBuyIn}
        disabled={disabled}
        onChange={(maxBuyIn) => patch({ maxBuyIn })}
      />
      <NumberField
        label="Reveal delay (ms)"
        value={value.afterRollDelayMs}
        disabled={disabled}
        onChange={(afterRollDelayMs) => patch({ afterRollDelayMs })}
      />
      <NumberField
        label="Correct call payout"
        value={value.callPayout}
        disabled={disabled}
        onChange={(callPayout) => patch({ callPayout })}
      />
      <NumberField
        label="Opening 1 penalty"
        value={value.openingOnePenalty}
        disabled={disabled}
        onChange={(openingOnePenalty) => patch({ openingOnePenalty })}
      />
      <NumberField
        label="Full house payout"
        value={value.fullHousePayout}
        disabled={disabled}
        onChange={(fullHousePayout) => patch({ fullHousePayout })}
      />
      <NumberField
        label="Seven: opponent payout"
        value={value.sevenOpponentPayout}
        disabled={disabled}
        onChange={(sevenOpponentPayout) => patch({ sevenOpponentPayout })}
      />
      <NumberField
        label="Seven: pot contribution"
        value={value.sevenPotContribution}
        disabled={disabled}
        onChange={(sevenPotContribution) => patch({ sevenPotContribution })}
      />
      <NumberField
        label="Over-25 payout per point"
        value={value.overTwentyFivePerPoint}
        disabled={disabled}
        onChange={(overTwentyFivePerPoint) => patch({ overTwentyFivePerPoint })}
      />
      <PayoutRow
        label="Loss with 2 dice"
        value={value.lossPayouts.twoDice}
        disabled={disabled}
        onChange={(amount) => payout('lossPayouts', 'twoDice', amount)}
      />
      <PayoutRow
        label="Loss with 3 dice"
        value={value.lossPayouts.threeDice}
        disabled={disabled}
        onChange={(amount) => payout('lossPayouts', 'threeDice', amount)}
      />
      <PayoutRow
        label="Loss with 4 dice"
        value={value.lossPayouts.fourDice}
        disabled={disabled}
        onChange={(amount) => payout('lossPayouts', 'fourDice', amount)}
      />
      <PayoutRow
        label="Loss with 5 dice"
        value={value.lossPayouts.fiveDice}
        disabled={disabled}
        onChange={(amount) => payout('lossPayouts', 'fiveDice', amount)}
      />
      <PayoutRow
        label="Loss with 6 dice"
        value={value.lossPayouts.sixDice}
        disabled={disabled}
        onChange={(amount) => payout('lossPayouts', 'sixDice', amount)}
      />
      <NumberField
        label="Successful rung 6"
        value={value.successfulRungSixPayout}
        disabled={disabled}
        onChange={(successfulRungSixPayout) => patch({ successfulRungSixPayout })}
      />
      <PayoutRow
        label="Straight: 3 dice"
        value={value.straightPayouts.threeDice}
        disabled={disabled}
        onChange={(amount) => payout('straightPayouts', 'threeDice', amount)}
      />
      <PayoutRow
        label="Straight: 4 dice"
        value={value.straightPayouts.fourDice}
        disabled={disabled}
        onChange={(amount) => payout('straightPayouts', 'fourDice', amount)}
      />
      <PayoutRow
        label="Straight: 5 dice"
        value={value.straightPayouts.fiveDice}
        disabled={disabled}
        onChange={(amount) => payout('straightPayouts', 'fiveDice', amount)}
      />
      <PayoutRow
        label="Straight: 6 dice"
        value={value.straightPayouts.sixDice}
        disabled={disabled}
        onChange={(amount) => payout('straightPayouts', 'sixDice', amount)}
      />
      <PayoutRow
        label="All same: 2 dice"
        value={value.allSamePayouts.twoDice}
        disabled={disabled}
        onChange={(amount) => payout('allSamePayouts', 'twoDice', amount)}
      />
      <PayoutRow
        label="All same: 3 dice"
        value={value.allSamePayouts.threeDice}
        disabled={disabled}
        onChange={(amount) => payout('allSamePayouts', 'threeDice', amount)}
      />
      <PayoutRow
        label="All same: 4 dice"
        value={value.allSamePayouts.fourDice}
        disabled={disabled}
        onChange={(amount) => payout('allSamePayouts', 'fourDice', amount)}
      />
      <PayoutRow
        label="All same: 5 dice"
        value={value.allSamePayouts.fiveDice}
        disabled={disabled}
        onChange={(amount) => payout('allSamePayouts', 'fiveDice', amount)}
      />
      <PayoutRow
        label="All same: 6 dice"
        value={value.allSamePayouts.sixDice}
        disabled={disabled}
        onChange={(amount) => payout('allSamePayouts', 'sixDice', amount)}
      />
      <PayoutRow
        label="Extra match: 3 dice"
        value={value.allSameExtraPayouts.threeDice}
        disabled={disabled}
        onChange={(amount) => payout('allSameExtraPayouts', 'threeDice', amount)}
      />
      <PayoutRow
        label="Extra match: 4 dice"
        value={value.allSameExtraPayouts.fourDice}
        disabled={disabled}
        onChange={(amount) => payout('allSameExtraPayouts', 'fourDice', amount)}
      />
      <PayoutRow
        label="Extra match: 5 dice"
        value={value.allSameExtraPayouts.fiveDice}
        disabled={disabled}
        onChange={(amount) => payout('allSameExtraPayouts', 'fiveDice', amount)}
      />
      <PayoutRow
        label="Extra match: 6 dice"
        value={value.allSameExtraPayouts.sixDice}
        disabled={disabled}
        onChange={(amount) => payout('allSameExtraPayouts', 'sixDice', amount)}
      />
    </div>
  );
}

function PayoutRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return <NumberField label={label} value={value} disabled={disabled} onChange={onChange} />;
}
