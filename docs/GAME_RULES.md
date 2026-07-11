# Canonical Game Rules

This file is the single source of truth for game rules. The code implements exactly this; if
a rule seems wrong, flag it — do not silently change either side. Rule logic lives in
`shared/src/game/` (pure, unit-tested) and is enforced by `server/src/engine.ts`.

## The game in one paragraph

2–3 seated players per room. Each round every seated player antes into a pot, then takes one
turn rolling 5 dice — keeping and re-rolling to build the best hand — trying to beat the
current roll-to-beat. Best stood hand wins the pot. Ties spawn sub-rounds with doubled antes.
Rolling a straight triggers an instant side payment from every other seated player.
A first-roll four-of-a-kind donates into a separate Classic Pot; three 6s while
roll-to-beat is unset wins that pot.

## Turn structure

1. A **round** begins: every seated player with chips antes into the pot. The ante is
   `min(settings.chipsPerRound, lowest positive stack)` — everyone who can play pays the
   same short-stack floor. Players with 0 chips sit the round out (they keep their seat).
   If fewer than 2 players have chips, the game ends.
2. Players act **clockwise** in seat order. The **first roller** rotates
   **counter-clockwise** from the previous first roller each round and each
   sub-round (so the same seat never opens twice in a row, including after a
   tie). The first round of a game starts at the lowest seat. If the previous
   first roller is sitting out or not in a tie, walk counter-clockwise until a
   participant is hit.
3. A turn is up to `rollCap` rolls of the 5 dice. After each roll the player may **keep**
   any of the five dice for the next throw — including releasing dice kept on earlier
   rolls of the same turn — and re-roll the rest. Keeping all 5 is rejected — stand instead.
4. **Roll-count pressure**: the first player to stand sets the roll cap for everyone after
   them that round. `settings.maxRolls` is the ceiling for the round's first player.
5. Rolls are **physics throws reported by the roller's client** (ADR 004): `turn:throwStart`
   locks the keep set, `turn:throwResult` reports the settled faces. The server never rolls;
   its integrity checks are dice ∈ [1,6] and kept positions unchanged.

## Scoring and comparison

Scoring lives in `shared/src/game/score.ts`; ordering in `compare.ts`.

- A hand scores as `{ count, face, rollsUsed, straight }`: `count` = size of the largest
  group of identical dice, `face` = that group's die value. `straight` is payout metadata
  only — it does not affect ranking.
- **Ones are wild**: each 1 joins whatever group makes the strongest hand (`1,1,3,3,3` →
  five 3s; `1,1,1,1,1` → five 6s). Wilds never count toward straights.
- Hand A beats hand B, in order:
  1. larger `count`, then higher `face` (except Yahtzees — see below),
  2. fewer `rollsUsed`,
  3. otherwise a **full tie** → sub-round.
- **Yahtzee** (five of a kind, including with wilds): face does not matter. Five 2s
  ties five 5s when `rollsUsed` is equal; fewer rolls still wins. Face ranking
  still applies for counts below five (four 6s beats four 2s).

## Straights

- A straight is the literal faces `1-2-3-4-5` or `2-3-4-5-6` — no wilds. Both patterns
  pay the same; neither outranks a non-straight for the pot.
- The group score under a straight is weak (`2-3-4-5-6` → one 6; `1-2-3-4-5` → two 5s,
  because the 1 is wild). Standing on a straight publishes that group as the roll-to-beat —
  a tradeoff for taking the payout.
- **Straight payout** (`settings.straightPayout`, applied in `engine.applyStraightPayout`):
  the moment a roll settles showing a straight, every other seated player immediately pays
  the roller from their own pile. Each transfer is
  `min(amountPerPlayer, payer.chips, roller.chips)` — reciprocal, so a short stack caps
  what either side can collect from the other. Chips never go negative. Zero-sum, pot
  untouched, at most once per turn, and it fires on the roll (the turn then continues
  normally). Replayed rolls re-apply it identically.

## Classic Pot

Side pool separate from the round-winner ante pot. Detection lives in
`shared/src/game/classic.ts`; applied in `engine.applyClassicDonation` /
`applyClassicPayout` on roll settlement (same moment as the straight payout).

- **Donation** (`settings.classicPot`): on a player's **first roll of their turn**
  (any seat), if the scored hand is exactly four of a kind (`count === 4`, wilds
  OK — Yahtzee does not donate), the roller transfers
  `min(donationAmount, roller.chips)` into `classicPot`. Zero transfers are
  skipped. Fires at most once per first roll that qualifies.
- **Payout**: when `rollToBeat` is still unset (nobody has stood yet this
  round/sub-round) and a settled roll scores three 6s (`count === 3`, `face === 6`,
  wilds OK), the roller takes the entire Classic Pot and the pool zeros. A zero
  pot skips the emit. The turn continues normally either way.
- The Classic Pot **persists across rounds and sub-rounds** within a game and
  resets when a new game starts. It is zero-sum against player stacks (ante pot
  untouched).
- **Settings**: `settings.classicPot = { enabled, donationAmount }`. Takes effect
  on the next roll settlement. Disabling freezes the pool (no donations, no
  wins) until re-enabled — any balance stays until claimed after re-enable.

## Standing

Rule: `shared/src/game/stand.ts` (`canStandVoluntarily`), mirrored client and server.

- A player may stand after any roll **unless** a roll-to-beat exists and their current hand
  loses to it — then they must keep rolling until they beat it, tie it, or hit the cap.
  Ties are allowed (they force a sub-round).
- Forced stands bypass the rule: roll cap reached (auto-stand), disconnect,
  kick.
- A turn that ends with **no completed roll** is **forfeited**: no hand, no shot at the pot,
  the ante stays in. If every turn in a round is forfeited the round has no winner
  (`winnerId: null`) and the pot carries over.

## Ties and sub-rounds

- Tied best hands start a **sub-round** among only the tied players, same pot.
- Each tied player antes the same amount: `min(chipsPerRound * 2^depth, lowest tied stack)`
  (doubling each level, equal floor — no asymmetric all-in). A winner takes the entire pot;
  no side pots.
- Roll caps reset each sub-round. Sub-rounds nest; past depth 10 antes stop and
  **sudden death** begins: single forced rolls, repeat until the tie breaks.

## Players, seats, host

- **2–3 seats** (`TABLE_SEAT_COUNT = 3`); everyone else spectates and may chat.
- The **host** (room creator) approves/denies seat requests, kicks (kicked → banned
  spectator), edits settings anytime (including mid-round), and starts the game (≥2 seated).
  Chip amounts take effect at the next natural point: `chipsPerRound` on the next round /
  sub-round ante, `straightPayout` / `classicPot` on the next roll settlement, buy-in
  bounds and `maxPlayers` on the next seat request, `maxRolls` on the next turn that
  reads the ceiling.
- Host disconnect → host transfers to the longest-seated connected player. Rooms empty for
  30 minutes are destroyed (log deleted).
- Seated players pick their own buy-in within `minBuyIn`/`maxBuyIn`.
- Round-end delay: 5s before the next round auto-starts.

## Room settings

| Setting | Default | Notes |
|---|---|---|
| `chipsPerRound` | 1 | Ante per player per round |
| `maxRolls` | 5 | Roll ceiling for the round's first player |
| `maxPlayers` | 3 | Clamped to 2–3 |
| `minBuyIn` / `maxBuyIn` | 10 / 1000 | Seat buy-in bounds |
| `straightPayout` | `{ enabled: true, amountPerPlayer: 5 }` | See Straights |
| `classicPot` | `{ enabled: true, donationAmount: 1 }` | See Classic Pot |

Defaults: `DEFAULT_SETTINGS` in `shared/src/types.ts`. Server-side clamping:
`clampSettings` in `server/src/room.ts`.
