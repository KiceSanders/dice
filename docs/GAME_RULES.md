# Canonical Game Rules

This file is the single source of truth for game rules. The code implements exactly this; if
a rule seems wrong, flag it — do not silently change either side. Rule logic lives in
`shared/src/game/` (pure, unit-tested) and is enforced by `server/src/engine.ts`.

## The game in one paragraph

2–3 seated players per room. Each round every seated player antes into a pot, then takes one
turn rolling 5 dice — keeping and re-rolling to build the best hand — trying to beat the
current roll-to-beat. Best stood hand wins the pot. Ties spawn sub-rounds with doubled antes.
Rolling a straight triggers an instant side payment from every other seated player.

## Turn structure

1. A **round** begins: every seated player antes `settings.chipsPerRound` into the pot.
   Players who cannot cover the ante sit the round out (they keep their seat). If fewer than
   2 players can ante, the game ends.
2. Players act in seat order, starting left of the previous round's winner.
3. A turn is up to `rollCap` rolls of the 5 dice. After each roll the player may **keep**
   dice (kept dice are locked for the turn — they can never be un-kept) and re-roll the
   rest. Keeping all 5 is rejected — stand instead.
4. **Roll-count pressure**: the first player to stand sets the roll cap for everyone after
   them that round. `settings.maxRolls` is the ceiling for the round's first player.
5. Rolls are **physics throws reported by the roller's client** (ADR 004): `turn:throwStart`
   locks the keep set, `turn:throwResult` reports the settled faces. The server never rolls;
   its integrity checks are dice ∈ [1,6] and kept positions unchanged.

## Scoring and comparison

Scoring lives in `shared/src/game/score.ts`; ordering in `compare.ts`.

- A hand scores as `{ count, face, rollsUsed, straight }`: `count` = size of the largest
  group of identical dice, `face` = that group's die value.
- **Ones are wild**: each 1 joins whatever group makes the strongest hand (`1,1,3,3,3` →
  five 3s; `1,1,1,1,1` → five 6s). Wilds never count toward straights.
- Hand A beats hand B, in order:
  1. straight beats non-straight,
  2. among non-straights: larger `count`, then higher `face`,
  3. fewer `rollsUsed`,
  4. otherwise a **full tie** → sub-round.

## Straights

- A straight is the literal faces `1-2-3-4-5` or `2-3-4-5-6` — no wilds. Both patterns
  are equivalent.
- Straights beat every non-straight hand; equal straights tie-break on `rollsUsed`.
- **Straight payout** (`settings.straightPayout`, applied in `engine.applyStraightPayout`):
  the moment a roll settles showing a straight, every other seated player immediately pays
  the roller `amountPerPlayer` chips from their own pile, clamped to what they have — chips
  never go negative. Zero-sum, pot untouched, at most once per turn, and it fires on the
  roll (the turn then continues normally). Replayed rolls re-apply it identically.

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
- Each tied player antes `chipsPerRound * 2^depth` (doubling each level); a short stack goes
  **all-in** for what it has — no side pots, a winner takes the entire pot.
- Roll caps reset each sub-round. Sub-rounds nest; past depth 10 antes stop and
  **sudden death** begins: single forced rolls, repeat until the tie breaks.

## Players, seats, host

- **2–3 seats** (`TABLE_SEAT_COUNT = 3`); everyone else spectates and may chat.
- The **host** (room creator) approves/denies seat requests, kicks (kicked → banned
  spectator), edits settings between rounds, and starts the game (≥2 seated).
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

Defaults: `DEFAULT_SETTINGS` in `shared/src/types.ts`. Server-side clamping:
`clampSettings` in `server/src/room.ts`.
