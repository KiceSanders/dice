// Dev helper (PLAN.md Phase 9 verification): scan DEBUG_SEED values for one
// where, with two players each standing after one roll, player A's first hand
// is a straight and player B ties or also rolls a straight.
import { scoreHand, compareHands, rollDice } from '@dice/shared';
import { seededRng } from '../src/engine.js';

function firstHands(seed) {
  const rng = seededRng(seed);
  const a = rollDice(5, rng);
  const b = rollDice(5, rng);
  return { a, b, sa: scoreHand(a, 1), sb: scoreHand(b, 1) };
}

const straightTies = [];
const plainTies = [];
const straights = [];
for (let i = 0; i < 200000; i++) {
  const seed = String(i);
  const { a, b, sa, sb } = firstHands(seed);
  const tie = compareHands(sa, sb) === 0;
  if (sa.straight !== 'none' && tie) straightTies.push({ seed, a, b });
  else if (tie) plainTies.push({ seed, a, b });
  else if (sa.straight !== 'none' && sb.straight !== 'none') straights.push({ seed, a, b });
}
console.log('double-straight ties:', straightTies.slice(0, 5));
console.log('plain ties:', plainTies.slice(0, 5));
console.log('double straights (no tie):', straights.slice(0, 5));
