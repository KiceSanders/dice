# Hit List slots

Hit List is a Bet-a-lot bonus machine with five vertical reels, each showing a die
face from 1 through 6. It is not a separate room kind. `/slots` provides a free,
local practice version with the same rules and no effect on room chips or tickets.

## Tickets and entry

- Matching the called face on the opening one-die throw earns exactly one ticket,
  in addition to the ordinary opening-call payment. The ticket is awarded after
  the throw's reveal delay, even if the configured call payment is zero.
- The ladder finishes normally. Once its payout queue drains, `round:continue`
  redeems **two tickets belonging to the same player** before starting the next
  ladder round. Single tickets stay banked across rounds until that player earns
  a second. The eight-second server fallback uses the same two-ticket rule.
  Redemption consumes exactly two tickets and leaves every other ticket intact.
- Both players and spectators see the same machine. Only the ticket owner can
  control it. Ordinary throws and round continuation cannot skip an active bonus.
- A game that ends through bankruptcy before redemption does not play its pending
  bonus. Tickets belong to the current game, not a persistent account balance.

## Five spins and locks

- Two tickets grant one session with five spins total: the first spin plus up to four rerolls.
- Every unlocked reel independently draws a uniform integer face from 1–6.
  Live draws come from the server; reel animation does not determine the result.
- After a spin settles, any die can be locked or unlocked with its button. Locks
  persist until released and preserve the exact face in that position.
- Locks, collection and additional spins are unavailable while reels are moving.
  Locking all five dice disables Spin; collect or unlock at least one die.
- The owner may collect the current hand early, including a zero-chip result.
  Spin five automatically completes the bonus and pays the final hand.
- Only the highest-paying target matched by the final hand pays. Targets do not
  stack; a match from an earlier, uncollected hand is not banked. Die order never
  matters, and ones are literal ones, never wild.

## Target catalog and payouts

Every slot session independently draws one target from each category. The target list
and printed prizes stay fixed throughout that bonus. All entries within a category
have equal selection probability. The labels are broad challenge categories, not
claims of equal odds within each category.

| Category | Target | Base chips |
|---|---|---:|
| Easy | At least two of a specified face (six possible targets) | 3 |
| Medium | At least three of a specified face (six targets) | 10 |
| Medium | Full house: exactly three of one face and two of another | 12 |
| Medium | Five-die straight: 1–2–3–4–5 or 2–3–4–5–6 | 15 |
| Hard | At least four of a specified face (six targets) | 30 |
| Hard | Five of a kind, any face | 75 |
| Hard | Five sixes | 100 |

The opponent funds the prize. When the bonus opens, each card displays its base
amount after applying the current Bet-a-lot Fire multiplier and capping it at the
opponent's chip balance. These are the actual payable amounts; Fire is not applied
again when collecting. Transfers conserve total chips and never take a stack below
zero. The Sevens Pot is separate. Slot wins do not change Fire streaks or add ladder
history entries. A player emptied by a slot payout loses the game after the bonus
result is dismissed or its result timer expires.

The catalog's base prizes are currently fixed, not host settings. This is an
initial prize schedule; no expected-return or equal-difficulty balancing is claimed.

## Timeouts and recovery

- There are 60 seconds to begin and 60 seconds to decide after each settled spin.
  Lock changes do not extend the decision deadline. If time expires, the current
  hand is collected; an unstarted bonus ends at zero without inventing a spin.
- Results remain visible until the owner selects Back to Bet-a-lot or eight seconds
  pass. The next ladder resumes with its normal alternating opener.
- A disconnect leaves the bonus available for rejoin until its deadline. Both original
  players must remain seated to pay a prize; a replacement cannot fund that bonus.
- Snapshots preserve unspent ticket balances, targets, locks, used spins, sampled pending faces,
  revision, deadlines and completed payout. Restart recovery never redraws a
  pending result or repeats a completed payment. Expired deadlines resolve on resume.
- Practice uses browser randomness, changes every target for the next practice
  round, and resets on refresh. It has no turn deadline or live chip transfers.
