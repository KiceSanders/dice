# Bet-a-lot: casino night ideas

Status: brainstorming backlog. These are proposed ideas, not implemented features or
approved game rules. The current rules remain in [betalot-rules.md](./betalot-rules.md).
All example stakes, triggers, frequencies, and rewards below are starting points to tune.

## What we want

Bet-a-lot is played heads-up between two friends who enjoy gambling. After roughly
50 rounds, the current loop starts to feel repetitive. The goal is to make it an
over-the-top private casino night, with the dice ladder as the core game and occasional
bonus games, bigger wagers, skill challenges, and opportunities to outplay each other.

The original ideas were:

- A slot-machine bonus spin, triggered randomly or by a game outcome.
- Occasional head-to-head shuffleboard.
- A high-risk, high-reward button that increases both potential winnings and losses.
- More unusual rules and games to keep expanding the experience.

The user liked most of the brainstorm below and asked to preserve it. Specific favorites
and implementation scope have not yet been selected.

The existing straights, all-same bonuses, Sevens Pot, and Fire already create surprise
payouts. These additions aim to introduce more decisions, rivalry, and changes of pace.

## 1. The High Roller button

Before the opening roll, a player hits a big red button and proposes **3× or 5× stakes
for the next round**. The opponent can accept, decline, or counter higher. Once accepted,
the table lights change and the wager locks.

Initial suggestion: multiply only the round's base payment, with the effective stakes
shown clearly alongside the existing side bets and Fire. The exact interaction with Fire
still needs to be specified.

Why it could work: turns a routine round into a negotiated showdown with a clear amount
at risk.

## 2. An earned slot-machine bonus

Implemented on 2026-10-13 as [Hit List slots](./hit-list-slots.md): a matched opening
call earns one ticket; two tickets from the same player are redeemed between rounds. Five dice reels, locks, five spins,
and curated targets pay the highest final-hand prize from the opponent's chips.
The shared bonus pot and cash-out-before-spinning alternatives below remain ideas.

Certain feats award a slot ticket. Possible triggers include matching an opening call,
winning a rung by exactly one, or breaking an opponent's Fire streak. Tickets are
redeemed between rounds. Random awards could be another trigger.

The key choice: **take a small guaranteed payout or spin for a larger one**. The reels
could award chips, a jackpot share, or an ability such as choosing the next minigame.
Both players watch the same reveal.

Suggested funding: a shared bonus pot to which both players contribute equally, giving
free spins a clear prize source. Contribution timing, prize tables, ticket limits, and
behavior when the pot is low remain open.

Why it could work: adds casino spectacle and anticipation, with a decision before the
spin.

## 3. Shuffleboard Showdown

Occasionally, the dice table becomes a short shuffleboard lane. Each player gets three
pucks and takes alternating shots. Knock the opponent's puck off or aim for a narrow
high-value zone.

Both players put a fixed stake into the pot before shooting. Between shots, either can
propose a raise, which the other must accept before it applies.

Why it could work: adds aiming, skill, and direct interference. This could become the
signature feature because it feels substantially different from rolling dice.

## 4. The Vault — cooperative greed, competitive betrayal

Both players enter a vault containing a seeded prize. Each step reveals more treasure
or a bust. Before each reveal, both secretly choose **leave or continue**.

- If both leave, they split what is available.
- If only one leaves, that player takes their share and the other continues alone.
- If a bust appears, players still inside lose their unbanked treasure.

Prize funding, share calculations, and reveal probabilities still need design work.

Why it could work: the tension comes from guessing when the opponent will leave and
deciding whether to continue alone.

## 5. Secret Contracts

Each player receives a hidden objective lasting several rounds: win on rung four, match
an opening call, or land a straight. Completing it awards a bonus-pot prize or a
minigame ticket.

Offer a choice of two contracts so there is a decision. The opponent learns what the
contract was only when it is completed and revealed.

Why it could work: gives players personal goals and creates unexpected reveals during
otherwise ordinary rounds.

## 6. Dice Blackjack

A quick duel using the existing dice: take turns rolling one additional die, trying to
get closest to 21 without going over. Both start with two dice; standing locks a
player's score.

Use equal stakes and split the pot on tied results. The case where both players bust
still needs an explicit rule.

Why it could work: creates a compact minigame built around the decision to take one
more roll.

## 7. Bounty Board

Three public challenges sit above the table, such as **first full house**, **first win
by exactly one**, or **first player to break Fire**. Each has a visible prize; claiming
one replaces it.

Why it could work: gives ordinary rounds additional meaning. A player might lose the
round while collecting a bounty the opponent had been chasing.

## 8. The Devil's Die

After winning a round, a player can put some of that round's winnings into a separate
challenge. If the opponent accepts, they match the stake. The challenger rolls:

- **1–3:** the opponent takes the pot.
- **4–6:** the challenger takes the pot.

The winner can propose another double-or-nothing challenge. Both players must agree
each time.

Why it could work: creates an occasional escalating showdown with a simple outcome
and a clearly displayed stake.

## 9. Trick Cards

Players occasionally earn a card such as **Reroll One Die**, **Make Them Reroll One
Die**, or **Choose the Next Event**. A player can hold at most one card, making the
timing of its use a decision.

Cards that affect dice need a defined play window before payments settle. Exact
eligibility, counterplay, and interactions with side bets remain open.

Why it could work: creates direct interference, memorable reversals, and friendly
grudges.

## 10. Boss Rounds

Every tenth round gets one announced special rule. Possible variants:

- Descend from six dice to one and try to roll lower.
- Replace sums with poker-style dice hands.
- Play a simultaneous closest-to-21 duel.

Give each boss round a name and its own table treatment. Each variant would need its
own scoring and payout rules before implementation.

Why it could work: creates recognizable chapters in a long session.

## 11. The Mystery Briefcases

Each player picks one of several cases containing shares of a shared prize pool. An
opening offer allows a player to trade their case for a guaranteed amount. Later,
players can offer to swap cases with each other.

Contents are unknown to both players. The case values, source of guaranteed offers,
and treatment of unclaimed prizes still need to be defined within the prize pool.

Why it could work: adds confidence, suspicion, negotiation, and trash talk without
requiring an aiming mechanic.

## 12. Championship Night

Play a defined session, such as 30 rounds, with scheduled event breaks and a final
showdown. Track chips alongside rivalry statistics:

- Biggest steal.
- Longest Fire streak.
- Best shuffleboard shot.
- Most failed challenges.

Let records persist between sessions. The relationship between a fixed session length,
the final showdown, and the current zero-chip game-ending rule still needs design.

Why it could work: gives the game recurring personality and records to compete over,
beyond the current chip balance.

## The connecting event system

Suggested starting behavior:

- Trigger an event somewhere between every six and ten completed rounds.
- Avoid consecutive repeats.
- Finish all current payouts before switching games.
- Let earned tickets provide an additional way to activate an event.
- Coordinate scheduled boss rounds and ticket redemptions so events do not pile up.

The aim is a mix of unexpected events and bonuses that players can intentionally
pursue. Frequency and event selection should remain tunable as the library grows.

## Suggested first build — not yet selected

1. **High Roller + slot tickets + the bounty board:** add negotiation, anticipation,
   and goals around the existing dice game.
2. **Shuffleboard:** add the larger centerpiece that introduces a different activity.
3. Expand the event library using the remaining ideas as desired.

## Next discussion

Which direction should lead the design: **casino spectacle**, **bluffing and betrayal**,
or **skill games with direct interference**? A mix is possible; the answer would help
choose the first implementation scope.
