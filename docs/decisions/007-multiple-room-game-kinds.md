# ADR 007: Multiple room game kinds

## Status

Accepted.

## Context

The application needs to host both the existing five-die game and the heads-up Bet-a-lot
ladder at the same URL while reusing room membership, chat, identity/rejoin, the 3D table,
the koozie, and physics pose relay. The rule engines, settings, and player-facing game state
are incompatible.

## Decision

A room chooses an immutable `GameKind` at creation. The setting payload is the discriminator:
`kind: 'betalot'` creates Bet-a-lot; legacy settings without it remain Dice5. The room layer
uses the selected kind for its seat limit and attaches the matching engine. Bet-a-lot-specific
messages are prefixed `betalot:` and its pure logic lives under `shared/src/games/betalot/`.

Shared dice rendering accepts a `diceCount` of 1–6. This is a presentation parameter, never
a rules decision; the server remains authoritative over which count the current rung permits.
Shared room settings contain only buy-in bounds and reveal delay; each game owns a separate
settings type and public-state type. Shared table presentation remains literal reuse:
Bet-a-lot's Sevens Pot uses the existing coin pyramid/chip-flight events and its latest ladder
total uses the existing top-band score lane.

## Consequences

- Existing Dice5 rooms and persisted settings remain valid.
- Bet-a-lot is limited to two seated players; additional users spectate and chat.
- A room's kind cannot be changed by settings update, avoiding a state migration mid-game.
- Any table change must still satisfy the three-renderer rule for roller, spectator, and
  between-turn static view.
- Adding a game must not satisfy legacy UI types with fake state fields; adapters narrow by
  game kind and reuse only the common room/table primitives the game actually has.
