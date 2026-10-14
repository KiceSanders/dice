# 010. Reuse Blackjack for Bet-a-lot's ten-round bonus

**Status:** accepted

Bet-a-lot automatically plays Dice Blackjack after every ten completed ladder rounds.
Keep the standalone room from ADR 008, but reuse its engine and table for the bonus rather
than implementing a second set of Blackjack rules. A small Bet-a-lot controller owns the
served-round marker, creates the engine, supplies the Fire-aware ledger, and returns to
normal continuation after one hand (including repeated overtime).

The containing room remains Bet-a-lot and stays at its between-round boundary. Nested
Blackjack state and private recovery fields are persisted together. Blackjack runs before
earned slots, requires no tickets, and changes only chip balances. Ladder round numbers,
opening order, Fire streaks and the Sevens Pot are preserved. Existing Blackjack wire
commands and notifications serve both modes; only the active current player can act or
relay poses. A client presentation adapter reuses all three existing table renderers.
