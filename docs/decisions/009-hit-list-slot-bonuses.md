# 009. Server-owned Hit List slot bonuses

**Status:** accepted

**Date:** 2026-10-13

## Context

Bet-a-lot awards one ticket for a matched opening call. Two tickets from the same
player buy one session; unspent tickets carry across ladder rounds. The chosen machine has
five dice reels, individual locks, five total spins and random curated prize targets.
The opponent funds payouts, capped at their chips. Everyone must see the same bonus,
and a refresh or restart must not redraw results or repeat a payment.

## Decision

Treat slots as a between-round Bet-a-lot subgame, separate from physical dice.
ADR 004 still governs all table throws. Symbolic slot reels use server-side
`crypto.randomInt`: the animation presents those results without a physics sim.
Use a pure shared round reducer and target catalog; keep the timer/authority
controller in `server/src/games/betalot/slots.ts`, with payments in the existing ledger.

Publish the complete bonus in Bet-a-lot snapshots: ticket owner, random bonus ID,
revision, targets, pending/settled faces, locks, spins, payout and deadlines.
Versioned owner-only commands reject replayed or stale actions. Compaction preserves
pending outcomes. The bonus is marked complete before broadcasting its chip transfer;
the completed transition is then compacted with the updated balances.
Recovery resumes a deadline/result, never a fresh random draw.

Capture Fire and the opponent cap in the printed prize cards. Pay only the highest
matching final-hand prize. The ladder waits for the bonus; decision and result
timeouts prevent an absent player from leaving it blocked indefinitely.

A native dialog renders one shared `SlotMachine` for all viewers, independently of
the table's three physics/static renderers. The separate `/slots` route provides
free practice outside the room provider, without consuming tickets or live chips.
