# Dice Blackjack

A heads-up game for exactly two seated players. Others may spectate and chat. All dice
are public. The target is **21**; every face counts at its printed value (1 is always 1).

## A round

1. Players alternate turns. Each turn starts with **one new six-sided die** in the cup.
2. Roll it onto the felt. Its value is immediately added to that player's live total.
   The die stays where it landed during the configured reveal delay.
3. After the reveal, choose **Stand** to lock the total, or **Continue** to remain in play.
   Either choice moves the die beside that player's seat, alongside all their prior dice,
   and passes the cup to the other player. These dice are never rerolled.
4. A player who has stood receives no more turns. The remaining player takes consecutive
   one-die turns, choosing Continue or Stand after each roll.
5. Exceeding 21 is an immediate loss after the reveal delay. If the opponent has stood,
   beating their total without busting immediately wins. Standing below their total loses.
   Reaching exactly 21 automatically stands; the other player can still tie it.
6. If both stand at the same total, start overtime. Otherwise the higher standing total wins.

The winner receives **10 chips from the loser**. There is no ante or separate pot.
Payments are limited to the loser's available chips and conserve the total chips in the room.
The result remains visible with a Next round button; any seated player can continue,
with an eight-second server fallback. A new regulation round alternates the opening player.
A player with no chips cannot start the next round.

## Overtime

Every tie resets both hands, totals, and standing status, alternates the opener, and begins
another round of the same rules with **one twelve-sided die per turn**, still targeting 21.
The stake doubles **again on every tie**: 10 → 20 → 40 → 80 → … . Overtime continues until
someone wins or busts. Only the eventual winner is paid. The next normal round returns to
six-sided dice and 10 chips. Stakes saturate at JavaScript's maximum safe integer, far beyond
any permitted chip stack; the actual transfer always uses the losing stack as its ceiling.

## Visibility and recovery

Both players' score, chip balance, and Standing/Bust/Winner status are visible beside their
seats. Dice accumulate in the existing kept-dice area; long hands use adjacent rows so the
center stays clear. The latest undecided die alone stays on the felt. Spectators, refreshes,
and recovered rooms see these same hands, totals, standings, die type, and overtime stake.
A kick or disconnect forfeits that participant's hand; a settled roll first finishes its
reveal delay. Uncommitted throws interrupted by a server restart can be retried; committed
rolls are recovered without adding the die or paying the winner twice.

## Settings

| Setting | Default | Bounds |
|---|---|---|
| Minimum buy-in | 20 | 1–1,000,000 |
| Maximum buy-in | 1,000 | Minimum buy-in–10,000,000 |
| Reveal delay | 2,000 ms | 0–10,000 ms |

Target, die types, and the 10-chip starting stake are fixed. Reveal-delay edits apply to
subsequent settlements, never to a delay already in progress.
