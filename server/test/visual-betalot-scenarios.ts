import type { BetALotSettings, Die } from '@dice/shared';

export interface VisualScenario {
  description: string;
  setup: Die[][];
  rolls: Die[][];
  call?: Die;
  wins?: number;
  sameWinner?: boolean;
  buyIns?: [number, number];
  settings?: Partial<BetALotSettings>;
  payments: string[];
  review: string;
}

const toFive: Die[][] = [[2], [1, 2], [1, 2, 3], [1, 2, 3, 4]];

export const visualScenarios: Record<string, VisualScenario> = {
  'opening-call': {
    description: 'Pick a called face, throw a match, watch the 3-chip payment.',
    setup: [],
    rolls: [[4]],
    call: 4,
    payments: ['call'],
    review: 'Called die animates beside the name, remains during the throw; one call payment.',
  },
  'opening-one': {
    description: 'A called one matches and also incurs the opening-one penalty.',
    setup: [],
    rolls: [[1]],
    call: 1,
    payments: ['call', 'openingOne'],
    review: 'Call +3 then opening-one -1, separate notices and chip flights.',
  },
  tie: {
    description: 'Rung two ties 3 and loses; next round opens with Bob.',
    setup: [[3]],
    rolls: [[1, 2]],
    payments: ['loss'],
    review: 'Tie loses 5; one history dot, no recap modal, next opener switches.',
  },
  straight: {
    description: 'Three-die straight after a legal two-die setup.',
    setup: [[2], [1, 2]],
    rolls: [[1, 2, 3]],
    payments: ['straight'],
    review: 'Three dice, straight +2, score 6, previous hand appears exactly once.',
  },
  sevens: {
    description: 'A total of seven pays the opponent and adds a coin to the pot.',
    setup: [[6]],
    rolls: [[3, 4]],
    payments: ['sevenOpponent', 'sevenPot'],
    review: 'Two ordered payments of 1; persistent pot becomes 1 and stacks agree.',
  },
  'extra-match': {
    description: 'Three fours earn an extra die; the extra four matches.',
    setup: [[2], [1, 2]],
    rolls: [[4, 4, 4], [4]],
    payments: ['allSame', 'allSameExtra'],
    review: 'All-same +3, extra die +5; original three dice stay visible and score stays 12.',
  },
  'extra-miss': {
    description: 'Three fours earn an extra die; an extra two misses.',
    setup: [[2], [1, 2]],
    rolls: [[4, 4, 4], [2]],
    payments: ['allSame'],
    review: 'All-same +3, no extra payment, turn passes; original score stays 12.',
  },
  'full-house': {
    description: 'Five-die full house pays 10.',
    setup: toFive,
    rolls: [[4, 4, 4, 5, 5]],
    payments: ['fullHouse'],
    review: 'Five visible dice, total 22, full-house +10, rung six becomes available.',
  },
  'high-total': {
    description: 'Six dice total 29: high-total payout, then successful rung-six payment.',
    setup: [...toFive, [1, 2, 3, 4, 5]],
    rolls: [[4, 5, 5, 5, 5, 5]],
    payments: ['overTwentyFive', 'loss'],
    review: 'High-total +8 then base +1; sequential notices and flights, Bob wins.',
  },
  'payout-sequence': {
    description: 'Six-die straight, seeded Sevens Pot claim, and round payment in sequence.',
    setup: [[6], [3, 4], [2, 3, 4], [2, 3, 4, 5], [2, 2, 3, 4, 5]],
    rolls: [[1, 2, 3, 4, 5, 6]],
    payments: ['straight', 'sevensPotWon', 'loss'],
    review:
      'Straight +20, pot +1, base +1; notices about one second apart, each flight starts fresh.',
  },
  fire: {
    description: 'Alice has won three rounds; Bob rolls one in round four.',
    setup: [],
    rolls: [[1]],
    call: 6,
    wins: 3,
    sameWinner: true,
    payments: ['openingOne'],
    review: 'Alice and table flame; Bob owes doubled opening-one penalty of 2.',
  },
  'fire-loss': {
    description: 'Alice is on Fire, then loses rung two to end the streak.',
    setup: [[6]],
    rolls: [[1, 2]],
    wins: 3,
    sameWinner: true,
    payments: ['loss'],
    review: 'Alice pays 5; her nameplate and table flames both clear; Bob gains a history dot.',
  },
  history: {
    description: 'Eleven completed rounds; inspect the newest ten and refresh the non-roller.',
    setup: [],
    rolls: [[4]],
    call: 4,
    wins: 11,
    payments: ['call'],
    review: 'Exactly ten newest-first winner dots, one per row; non-roller refresh preserves them.',
  },
  bankruptcy: {
    description: 'Bob has 10 chips; a configured 100-chip call payout is capped at 10.',
    setup: [],
    rolls: [[4]],
    call: 4,
    buyIns: [100, 10],
    settings: { callPayout: 100 },
    payments: ['call'],
    review: 'Bob reaches exactly zero, Alice gains 10, game ends without another throw.',
  },
};
