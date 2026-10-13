---
name: test-betalot
description: On-demand computer-use testing of Bet-a-lot or Dice Blackjack with prepared local scenarios and a short review video. Invoke explicitly; never run automatically after implementing a feature.
---

# Test Bet-a-lot or Blackjack and return a video

Use this skill only when the user explicitly asks to use it or asks for a recorded
computer-use test. That invocation authorizes the local browser test and recording.
Creating or editing this skill alone does not authorize a browser run. Do not change
the selected model. The user can switch models before invoking it.

Work in the dice repository (on this machine: `/Users/kicesanders/dev/dice3`). Keep
the scope to the requested feature: normally **one preset, two tabs, one 20–40 second
clip**. Do not run the entire catalog or fix product code unless asked. If no feature
is specified, use `opening-call`; when the user names Blackjack, use `blackjack-decisions`
unless they ask for another case. Never substitute a Bet-a-lot scenario for a Blackjack
request. An explicit longer checklist overrides this default.

## Prepare

1. Check `git status --short` and listeners on ports 5173/3001. Reuse the existing
   local dev stack. If neither exists, start `npm run dev` once; if only one exists,
   start only the missing workspace. Do not kill user-owned processes or allow port drift.
2. Choose a preset below, then run from the repository root:

   ```bash
   npm run visual:betalot -- PRESET artifacts/betalot/RUN_NAME
   ```

   Use a fresh `RUN_NAME`. The command stays running and prints the actor/opponent
   URLs, required call, throws and visual acceptance checks; the full starting state
   is saved in `setup.json`. Keep its process/session handle and printed `fixturePid`. Stop it after closing
   the test tabs (it expires after 20 minutes). Closing its sockets early can forfeit
   the active turn, even after the browser has reclaimed that identity.
3. Open the printed **actor** link with `mcp__cua_repl` in a named Chrome test session.
   Resolve its native window ID and complete the three-second recorder check from
   [recording.md](references/recording.md), then open the **opponent** link. They open
   the real room UI, already seated at the target state. Keep both players connected;
   closing or refreshing either Blackjack player forfeits the hand. Do not disconnect
   a player to distinguish recording windows—identify the actor window before opening
   the second tab, or use the current Chrome window UI to identify it.
   Identity is isolated per tab; no manual localStorage editing is needed. Wait for
   **Connection: open** and confirm names, dice count, score and balances against setup.
   These command-generated links also enable a **Test roll** button for the local
   roller. It is absent from ordinary rooms and production builds. Use the spectator
   link only when that view is relevant.

| Preset | Situation to review |
|---|---|
| `opening-call` | Call face 4, one die matches, called-face display and +3 |
| `opening-one` | Call face 1; +3 then -1 in two separate notices |
| `tie` | Rung two ties 3; loses 5; history and next-round handoff |
| `straight` | Three-die straight pays 2 |
| `sevens` | Total 7: opponent payment, pot contribution, visible pot |
| `extra-match` | Three fours, then an extra four; +3 then +5 |
| `extra-miss` | Three fours, then an extra two; no extra payment |
| `full-house` | Five dice total 22; full-house payment of 10 |
| `high-total` | Six dice total 29; high-total +8 then base +1 |
| `payout-sequence` | Six-die straight +20, seeded pot +1, base +1 |
| `fire` | Three Alice wins already prepared; Bob's face-one penalty doubles to 2 |
| `fire-loss` | Alice loses while on Fire; flames clear on table and nameplate |
| `history` | Eleven completed rounds; only newest ten survive non-roller refresh |
| `bankruptcy` | Bob has 10; configured call payout 100 caps at 10 and ends the game |
| `blackjack-decisions` | Alice stands at 6; Bob rolls 3, Continue, rolls 4, wins 10 |
| `blackjack-overtime` | D12 overtime; Bob stands at 10, Alice rolls 12 and wins 20 |
| `blackjack-bust` | Alice stands at 18; Bob rolls 6 from 17, busts at 23, pays 10 |

For a missing situation, inspect the selected game's rules in `docs/games/betalot-rules.md`
or `docs/games/blackjack-rules.md`. Bet-a-lot presets live in
`server/test/visual-betalot-scenarios.ts`; Blackjack presets and their setup live in
`server/test/visual-blackjack-fixture.ts`. Reuse the closest
setup. If a new deterministic preset is necessary, add it to that catalog and run its
integration test; do not invent server state or change game rules to manufacture a pass.

## Exercise and record

Read [recording.md](references/recording.md) for the native recorder commands. Record
only the Chrome window whose title contains this fixture's room code. Start recording
after setup, before the action. Keep the game window selected until recording ends.

Use computer use for **the feature being reviewed**:

- Pick the printed called face when prompted (`die showing N` in `Call opening face`).
- Blackjack has no called face. Follow the printed `decisions` after each matching
  throw: select Stand or Continue only once enabled after reveal. An empty decisions
  list means the target throw resolves automatically. Confirm the named game's HUD.
- Click **Test roll** once enabled. It automatically picks up/releases the real cup
  through the existing physics path, avoiding coordinate-based dragging. It respects
  the called-face, turn and reveal barriers. For extra dice or Continue, click it again
  when the next cup is ready. Do not send throw results directly or use write-evaluate.
- When reviewing the drag interaction itself, use the actual cup gesture instead:
  locate it in a fresh screenshot, drag onto the felt, and release.
- Wait for settlement and the two-second reveal delay, then watch the complete notice/
  chip-flight sequence and handoff.
- Inspect the other tab's result and balances. Refresh only the non-roller for history
  checks in Bet-a-lot: disconnecting the current roller can forfeit their turn. For
  Blackjack, use a spectator for refresh checks; disconnecting either player forfeits.
- Use fresh accessibility/DOM state for controls and screenshots for visual questions.
  Batch deterministic actions, prefer small AX diffs, and avoid repeated screenshots
  during animation—the recorder captures those frames without sending them to the model.
  Follow the tool's current API documentation; do not guess APIs or use write-evaluate.

The setup command scripts **earlier** rounds through real WebSockets. The final throw
uses the test button's automatic cup release (or an explicit drag test), real physics,
and the existing dev-only forced-face hook; queued overrides clear
after their matching throws. Disclose "forced dice for reproducibility" with the clip.
Such clips demonstrate UI effects; they do not certify manual cup dragging, natural
physics settling or dice fairness. For physics-specific work, use unforced throws and
the appropriate browser checklist.

## Finish

- Inspect the recorded MP4 and review frames as described in the recording reference.
  Read browser console errors once if the selected browser exposes them. Compare both
  tabs' visible outcomes with the preset's `review` text; report observed failures honestly.
- Save a short `review.md` beside the MP4: scenario, expected/observed result, timestamps
  of useful moments, which viewpoints ran, forced dice, and any limitations. Include
  the current commit and whether the working tree was dirty. A prepared room or a passing
  protocol test alone is not browser verification.
- Close only your test tabs, stop the fixture, and stop only dev processes you started.
  Never commit recordings or fixtures. Do not rerun successful scenes for aesthetics
  unless the clip missed the feature. After two failed attempts at the same action,
  report the concrete obstacle instead of burning tokens in a loop.
- Return the video using `![Bet-a-lot review](/absolute/path/review.mp4)`, plus one or two
  sentences describing what ran and whether it matched expectations. Link `review.md`
  when useful. The user decides whether the implementation looks good.

The installed skill name remains `$test-betalot` for compatibility; it supports both
games. Use a Blackjack label on Blackjack videos.

If computer-use access or recording permission is missing, finish unaffected checks,
state the exact blocker and ask only for the access needed. Never present screenshots,
a slideshow, a mockup or protocol-only execution as an actual screen recording.
