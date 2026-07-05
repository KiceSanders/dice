import { rollDice } from '@dice/shared';
import { seededRng } from '../src/engine.js';

const r = seededRng('3116');
console.log(rollDice(5, r), rollDice(5, r), rollDice(5, r));
