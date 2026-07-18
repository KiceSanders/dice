# Canonical Game Rules

This file is the single source of truth for game rules. The code implements exactly this; if
a rule seems wrong, flag it — do not silently change either side. Rule logic lives in
`shared/src/game/` (pure, unit-tested) and is enforced by `server/src/engine.ts`.

## The game in one paragraph

2–8 seated players per room. Each round every seated player antes into a pot, then takes one
turn rolling 5 dice — keeping and re-rolling to build the best hand — trying to beat the
current roll-to-beat. Best stood hand wins the pot. Ties spawn sub-rounds with doubled antes.
Rolling a straight triggers an instant side payment from every other seated player.
A first-roll four-of-a-kind donates into a separate Classic Pot; a first-roll
three 6s while roll-to-beat is unset wins that pot. A first-roll Yahtzee
(wilds count) triggers an instant side payment from every other seated player.
A Yahtzee also earns a one-die bonus throw — matching the quint's face makes
every other seated player pay the roller.

## Turn structure

1. A **round** begins: every seated player with chips antes into the pot. The ante is
   `min(settings.chipsPerRound, lowest positive stack)` — everyone who can play pays the
   same short-stack floor. `chipsPerRound` itself grows at auto-raise boundaries (see
   "Stakes: multiplier and auto-raise"). Players with 0 chips sit the round out (they keep
   their seat). If fewer than 2 players have chips, the game ends.
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
6. **After-roll delay**: every normal roll and Yahtzee bonus die is followed by
   `settings.afterRollDelayMs` of quiet inspection time. Settled dice publish immediately,
   but no outcome is revealed until the delay elapses: no side-bet transfer, Classic Pot
   movement, straight celebration, Yahtzee bonus offer/result, automatic stand, turn change,
   sub-round/fire effect, pot award, or round recap. On an ordinary non-terminal roll, the
   koozie docks immediately and the same player may select keeps and throw again while the
   prior quiet window is still running. Standing remains blocked until all pending roll
   outcomes resolve. A capped roll, a last-player beat of the roll-to-beat, a Yahtzee bonus
   transition, and a settled bonus die lock and hide the koozie immediately because that
   delayed result changes the throw mode or possession.
   Each settled roll captures its dice and delay independently; a mid-delay settings edit
   applies to the next roll.

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
- **Straight payout** (`settings.straightPayout`, applied after the roll's configured delay):
  when a settled straight resolves, every other seated player pays the roller from their own
  pile. Each transfer is
  `min(amountPerPlayer, payer.chips)` — short payers pay what they have; a short or broke
  roller still collects the full amount from each solvent payer. Chips never go negative.
  Zero-sum, pot untouched, at most once per turn, and it fires when the roll resolves (the turn
  then continues normally). Replayed rolls re-apply it identically without replay-time waits.

## Classic Pot

Side pool separate from the round-winner ante pot. Detection lives in
`shared/src/game/classic.ts`; donation/payout applies after the configured delay with the
straight payout.

- **Donation** (`settings.classicPot`): on a player's **first roll of their turn**
  (any seat), if the scored hand is exactly four of a kind (`count === 4`, wilds
  OK — Yahtzee does not donate), the roller transfers
  `min(donationAmount, roller.chips)` into `classicPot`. Zero transfers are
  skipped. Fires at most once per first roll that qualifies.
- **Payout**: when `rollToBeat` is still unset (nobody has stood yet this
  round/sub-round) and the player's **first roll of their turn** scores three 6s
  (`count === 3`, `face === 6`, wilds OK — a "classic"), the roller takes the
  entire Classic Pot and the pool zeros. Later rolls of the turn that reach
  three 6s do not win it. A zero pot skips the emit. The turn continues normally
  either way.
- The Classic Pot **persists across rounds and sub-rounds** within a game and
  resets when a new game starts. It is zero-sum against player stacks (ante pot
  untouched).
- **Settings**: `settings.classicPot = { enabled, donationAmount }`. Takes effect
  on the next roll settlement. Disabling freezes the pool (no donations, no
  wins) until re-enabled — any balance stays until claimed after re-enable.

## First-roll Yahtzee payout

Instant side payment for scoring a Yahtzee on the **first roll of a turn**.
Detection lives in `shared/src/game/firstRollYahtzee.ts` (`isFirstRollYahtzee`);
the payout fires when the roll resolves via `applyFirstRollYahtzeePayout`
(with the straight payout / Classic Pot rules).

- **Trigger** (`settings.firstRollYahtzeePayout`): the settled hand scores five
  of a kind with `rollsUsed === 1`. **Wilds count** (`6,6,6,1,1` and
  `1,1,1,1,1` both qualify). Later-roll Yahtzees do not.
- **Payout**: after the quiet window, every other seated player pays the roller
  `min(amountPerPlayer, payer.chips)` — the same payer-only cap as the straight
  payout. Zero-sum, pot untouched.
- **Independent of the Yahtzee bonus**: a first-roll Yahtzee still offers the
  sixth-die bonus throw afterward; both payouts can fire in the same turn.
- **Settings**: `settings.firstRollYahtzeePayout = { enabled, amountPerPlayer }`.
  Takes effect on the next roll settlement.

## Yahtzee bonus

Instant side bet on rolling a Yahtzee. Detection lives in
`shared/src/game/yahtzeeBonus.ts` (`yahtzeeBonusTarget`); the offer fires in
`engine.offerYahtzeeBonus` after the main roll's delay and the payout in
`engine.applyYahtzeeBonusPayout` after the bonus die's own delay.

- **Trigger** (`settings.yahtzeeBonus`): after a roll settles scoring five
  of a kind (**wilds count**: `6,6,6,1,1` is five 6s; `1,1,1,1,1` scores five
  6s), the turn pauses. All **five Yahtzee dice stay on the rail**, and the
  roller throws a temporary **sixth bonus die** with the real cup gesture (a
  real physics throw, ADR 004 — `turn:bonusThrowStart` /
  `turn:bonusThrowResult`). The sixth die exists only for that throw and
  remains visible where it settles for its own after-roll quiet window, then is
  removed when the delayed result resolves; it never replaces or alters a die
  in the five-die hand.
- **Match**: the bonus die must **literally equal the quint's scored face** — a
  rolled 1 is NOT wild here (quint of 6s needs a 6; a 1 misses). On a match,
  every other seated player pays the roller after the bonus die's quiet window:
  `min(amountPerPlayer, payer.chips)` — the same payer-only cap as the straight
  payout. Zero-sum, pot untouched. On a miss nothing happens.
- **Turn flow**: while the bonus is pending, re-rolling and voluntary standing
  are rejected — throw the bonus die first. After the bonus settles (**hit or
  miss**), the roller **stands automatically** on the five-die Yahtzee. A quint
  on the final allowed roll therefore defers its stand only until the bonus die
  resolves.
- **At most once per turn** (the bonus resolution ends the turn; the offer is
  also latched so disabling mid-throw cannot re-arm it).
- Forced stands (disconnect, kick) abandon a pending bonus: the player stands
  on the quint, no payout. Crash recovery replays the quint and re-offers the
  bonus; a recorded bonus die replays verbatim (`bonusRolled` room event).
- **Settings**: `settings.yahtzeeBonus = { enabled, amountPerPlayer }`. The
  offer checks `enabled` from the main roll settlement; the payout re-reads it at the
  bonus commit, so disabling between offer and commit pays nothing. A later edit during the
  bonus die's quiet window applies to the following roll.

## Stakes: multiplier and auto-raise

Logic lives in `shared/src/game/stakes.ts` (`shouldRaiseStakes`, `raiseStakes`), applied by
the engine when a round starts (`stakesRaised` engine event).

- **Auto-raise**: when round N starts and `(N - 1) % everyRounds === 0` (N > 1, auto-raise
  enabled), the **stored settings amounts are multiplied in place by `betMultiplier`**:
  `chipsPerRound`, `straightPayout.amountPerPlayer`, `classicPot.donationAmount`,
  `yahtzeeBonus.amountPerPlayer`, and `firstRollYahtzeePayout.amountPerPlayer`. With the
  defaults (`betMultiplier: 2`, every 7 rounds) rounds 1–7 use the configured amounts,
  rounds 8–14 double them, rounds 15–21 double them again, and so on — stakes escalate so
  games don't drag on.
- The raise **writes the new values into the room settings** (visible in the settings
  panel and every snapshot). The host can edit any amount between raises — including
  lowering it — and the game uses the stored value immediately at its usual natural point;
  the **next raise builds on whatever is stored then**.
- The Classic Pot **win** is untouched — it always pays the whole accumulated pool. The
  Classic Pot balance itself is never scaled, only the donation. Sub-round antes double
  from the (possibly raised) `chipsPerRound` as usual. Per-payer caps
  (`min(amount, payer.chips)`) are unchanged. Raised values cap at the clamp ceilings
  (ante 1000, bet amounts 100000).
- `betMultiplier: 1` (or disabling auto-raise) freezes the amounts. The raise is
  deterministic from the round number and stored settings, so crash-recovery replay
  re-derives it — it is not persisted as its own event.
- **Settings**: `betMultiplier` (default 2) and
  `autoIncrement = { enabled, everyRounds }` (default `{ enabled: true, everyRounds: 7 }`).

## Standing

Rule: `shared/src/game/stand.ts` (`canStandVoluntarily`, `mustAutoStandLastPlayerBeat`),
mirrored client and server.

- A player may stand after any roll **unless** a roll-to-beat exists and their current hand
  loses to it — then they must keep rolling until they beat it, tie it, or hit the cap.
  Ties are allowed (they force a sub-round).
- Forced stands bypass the rule: roll cap reached (auto-stand), **last player of the
  round/sub-round beats the roll-to-beat** (auto-stand after the after-roll delay — further
  rolls cannot change the pot winner; a mere tie does not auto-stand, so they may keep
  rolling to try to win outright), disconnect, kick.
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

- **Up to 8 seats** (`MAX_SEATED_PLAYERS = 8`), fixed for every room; capacity is not a
  game setting. Everyone else spectates and may chat.
- In the lobby, all eight logical slots are available. Once play starts, clients render only
  occupied seat cards. Spectators may request a seat during play; approval seats them
  immediately, and the table reflows the occupied cards along the lower arc. They enter the
  turn order and pay an ante at the next round boundary.
- The **host** (room creator) approves/denies seat requests, kicks (kicked → banned
  spectator), edits settings anytime (including mid-round), and starts the game (≥2 seated).
  Chip amounts take effect at the next natural point: `chipsPerRound` on the next round /
  sub-round ante, `straightPayout` / `classicPot` / `yahtzeeBonus` /
  `firstRollYahtzeePayout` on the next roll settlement, `afterRollDelayMs` on the next
  settled normal/bonus roll, buy-in bounds on the next seat request, `maxRolls` on the next
  turn that reads the ceiling.
- Host disconnect → host transfers to the longest-seated connected player. Rooms empty for
  30 minutes are destroyed (log deleted).
- Seated players pick their own buy-in within `minBuyIn`/`maxBuyIn`.
- Round handoff: the configured after-roll delay applies to the final dice **before**
  `round:ended`; it is not applied again afterward. The winner recap appears with that delayed
  result and auto-dismisses after 2.8s (or may be dismissed earlier). The first seated client's
  dismissal immediately starts the next round and passes the koozie to its first roller.
  Duplicate dismissals are harmless. An 8s server timer is retained only as a failure fallback
  if no seated client can deliver the dismissal.

## Room settings

| Setting | Default | Notes |
|---|---|---|
| `chipsPerRound` | 1 | Ante per player per round |
| `betMultiplier` | 2 | Factor each auto-raise applies to the stored bet amounts — see Stakes: multiplier and auto-raise |
| `autoIncrement` | `{ enabled: true, everyRounds: 7 }` | Periodic in-place raise of the stored bet amounts — see Stakes: multiplier and auto-raise |
| `maxRolls` | 5 | Roll ceiling for the round's first player |
| `afterRollDelayMs` | 2000 | Quiet outcome window after every normal/bonus roll; ordinary same-player rerolls remain immediate; clamped to 0–10000 ms |
| `minBuyIn` / `maxBuyIn` | 10 / 1000 | Seat buy-in bounds |
| `straightPayout` | `{ enabled: true, amountPerPlayer: 3 }` | See Straights |
| `classicPot` | `{ enabled: true, donationAmount: 1 }` | See Classic Pot |
| `firstRollYahtzeePayout` | `{ enabled: true, amountPerPlayer: 4 }` | See First-roll Yahtzee payout |
| `yahtzeeBonus` | `{ enabled: true, amountPerPlayer: 3 }` | See Yahtzee bonus |

Defaults: `DEFAULT_SETTINGS` in `shared/src/types.ts`. Server-side clamping:
`clampSettings` in `server/src/room.ts`.
