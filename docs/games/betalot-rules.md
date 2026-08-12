# Canonical Bet-a-lot Rules

This file is the source of truth for Bet-a-lot rules. The code must implement these rules
exactly; if a rule appears wrong, flag it rather than silently changing either the rules or
the implementation. For Dice5, see the [Dice5 rules](./dice5-rules.md); the
[game-rules index](../GAME_RULES.md) links both room games.

## Players, chips, and room settings

- Bet-a-lot is heads-up: exactly two players are seated. Everyone else is a spectator and may
  chat only.
- There are no antes. Each seated player's starting chips / buy-in comes from the room
  settings.
- Scores are literal sums of all dice in the applicable throw. Die faces are never wild.
- Every transfer is capped at the payer's current chips. A player never has negative chips.
- A player who reaches 0 chips loses the game. Rebuys are not allowed while a game is in
  progress.
- Every rule amount is a room setting with the values specified below. A host settings change
  applies at the next throw.
- Every settled normal or extra throw has the room's reveal delay (2 seconds by default).
  Dice and the rung score become visible immediately; payments, extra-die offers, ladder
  handoff, and round end resolve only after the captured delay.

## Rung round

Each round has six ordered rungs:

1. The **round opener** alternates between the two players from round to round.
2. Rungs run from 1 through 6. Rung *n* uses exactly *n* dice in a single throw: there are no
   keeps and no rerolls.
3. The opener rolls odd-numbered rungs (1, 3, and 5); the opponent rolls even-numbered rungs
   (2, 4, and 6).
4. Starting with rung 2, the roller must strictly exceed the preceding rung's total. A tie
   loses.
5. If a player loses on rungs 2 through 6, that player pays the opponent the configured loss
   payout for the number of dice in the losing rung:

   | Losing rung / dice | Payout |
   |---|---:|
   | 2 | 5 |
   | 3 | 4 |
   | 4 | 3 |
   | 5 | 2 |
   | 6 | 1 |

6. If rung 6 succeeds, the opponent wins the round and the opener pays the opponent 1.

The base rung-loss payment resolves only after the roll's side bets, including a qualifying
extra die, have resolved.

## Side bets and per-roll effects

Apply side bets in this order for every normal rung throw: the opening call, then immediate
per-roll effects, then the extra roll if it qualifies, and finally the base loss payment if
the round has ended.

### Opening call

Before the opener makes the opening one-die throw, the opener calls one face.

- If the die matches the called face, the opponent pays the opener 3.
- If the opening one-die result is a face one, the opener pays the opponent 1.

### Literal straights

A straight is a throw whose dice are all distinct and form one literal consecutive sequence.
The opponent pays the roller the configured straight amount:

| Dice in straight | Payout |
|---|---:|
| 3 | 2 |
| 4 | 5 |
| 5 | 10 |
| 6 | 20 |

### All-same

When all dice in a throw show the same face, the opponent pays the roller the configured
all-same amount:

| Dice all the same | Payout |
|---|---:|
| 2 | 1 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 |

An all-same result of three or more dice also awards the roller one extra die roll.

- The extra die must match the all-same result's original face for the opponent to pay the
  configured extra-roll amount:

  | Original all-same dice | Extra-roll match payout |
  |---|---:|
  | 3 | 5 |
  | 4 | 20 |
  | 5 | 50 |
  | 6 | 100 |

- The extra die is excluded from the normal throw total and rung ladder.
- The extra die cannot trigger any other side bet.
- An all-same pair has no extra roll.

### Full house

A five-die full house (three dice of one face and two of another) makes the opponent pay the
roller 10.

### Sevens Pot

- A throw with a total exactly 7 makes the roller pay the opponent 1 and add 1 to the
  persistent Sevens Pot.
- A throw with a total exactly 21 lets the roller claim the entire Sevens Pot.
- A six-die straight totaling 21 triggers both its straight payout and the Sevens Pot claim.

The Sevens Pot persists until claimed. Its contribution and claim transfers follow the same
payer-chip cap as every other transfer.

### High totals

If a throw's total is greater than 25, the opponent pays the roller twice the amount over 25:
`2 × (total − 25)`.

## Fire

Winning three consecutive rounds arms Fire for that player beginning with the fourth round.
While the on-fire player remains undefeated, any amount owed by the opponent doubles. This
includes base loss payments, side-bet payments, and contributions to the Sevens Pot. Fire ends
as soon as the on-fire player loses a round.

## Settings

All values below are room settings. The listed values are the canonical current values:

| Setting | Value |
|---|---:|
| Opening-call match payout | 3 |
| Opening face-one payment | 1 |
| Straight payout, 3 / 4 / 5 / 6 dice | 2 / 5 / 10 / 20 |
| All-same payout, 2 / 3 / 4 / 5 / 6 dice | 1 / 3 / 4 / 5 / 6 |
| All-same extra-roll match payout, 3 / 4 / 5 / 6 dice | 5 / 20 / 50 / 100 |
| Full-house payout | 10 |
| Rung loss payout, 2 / 3 / 4 / 5 / 6 dice | 5 / 4 / 3 / 2 / 1 |
| Successful rung-6 opener payment | 1 |
| Total-7 payment and Sevens Pot contribution | 1 |
| Total-over-25 multiplier | 2 |
| Reveal delay | 2000 ms |

Room settings also define the players' starting chips / buy-in. Host edits to any setting take
effect at the next throw.
