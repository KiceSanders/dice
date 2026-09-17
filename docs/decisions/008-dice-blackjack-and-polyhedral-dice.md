# 008. Dice Blackjack and physical twelve-sided dice

**Status:** accepted

## Decision

Dice Blackjack is an independent `blackjack` room kind with two seated participants,
server-owned totals/decisions/stakes, and one physics-authoritative die per turn (ADR 004).
The game targets 21, pays 10 chips normally, resets both hands on a tie, and uses a d12 in
all overtime rounds. Every additional tie doubles the stake again. Actual transfers are
limited to the losing stack and never create chips.

Keep `Die` as the original six-face rules type. Shared presentation accepts numeric faces
and an explicit `DieSides` (6 or 12), while each ruleset validates its own range. The d12
uses the dual of a regular icosahedron: twelve face normals, twenty vertices and twelve
pentagonal faces. One pure shared module generates the numbered mesh's vertices, the
Rapier convex hull and the server/client face readers. Opposite values sum to 13. The
existing cup, soft CCD settings and physical pour behavior are reused.

A new `rollKey` rebuilds the one-die runtime on every cup handoff, including consecutive
turns by a player whose opponent has stood. After settlement, all viewers use the same
authoritative rest-pose resolver. On Stand/Continue the latest die joins a persistent,
snapshot-derived rail layout beside its owner. This layout renders outside all three
live/static dice modes. Small hands use existing kept-die positions; long hands wrap into
nearby rows, with framing tests for both player viewpoints and spectators. Per-player
scores/status stay at the corresponding seats, while stakes/round/result use the top band.

## Recovery and validation

Compact blackjack snapshots carry the complete hand history, pending reveal, standings,
overtime and completed payment. Recovery resolves committed rolls once and retries
uncommitted throws. Structural protocol tests, engine tests, room recovery tests, real
WebSocket integration, geometry/framing tests and headless Rapier settlement tests cover
the new behavior. Multi-tab visual/browser verification remains user-owned.
