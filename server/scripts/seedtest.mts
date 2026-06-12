import { seededRng } from '../src/engine.js';
import { rollDice } from '@dice/shared';
const r = seededRng('3116');
console.log(rollDice(5, r), rollDice(5, r), rollDice(5, r));
