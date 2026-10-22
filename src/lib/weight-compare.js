/**
 * weight-compare.js — real-world comparisons for weight lost or gained (fork).
 *
 * "1 lb down: about the weight of an average book." Approximate on purpose (the phrase
 * always says "about"), and only offered when something on the list is genuinely close.
 * Names are unit-free; the amount is shown separately in the user's own unit.
 */
const LB = 0.45359237;

/** [pounds, what it weighs about]. Ordinary things whose weight people know. */
const LADDER = [
  [0.5, 'a large avocado'],
  [1, 'an average book'],
  [2, 'a pineapple'],
  [3, 'a laptop'],
  [4, 'a half-gallon of milk'],
  [5, 'a bag of sugar'],
  [7, 'a newborn baby'],
  [8, 'a gallon of milk'],
  [10, 'a bag of potatoes'],
  [12, 'a bowling ball'],
  [15, 'a Thanksgiving turkey'],
  [20, 'a bag of cat litter'],
  [25, 'a two-year-old child'],
  [30, 'a beagle'],
  [40, 'a bag of dog food'],
  [50, 'a bag of concrete mix'],
  [75, 'a Labrador retriever'],
  [100, 'a twelve-year-old child'],
].map(([lb, name]) => ({ kg: lb * LB, lb, name }));

/** The closest everyday object to `kg` (within roughly 30%), or null. */
export function compareKg(kg) {
  const x = Math.abs(Number(kg));
  if (!(x > 0)) return null;
  let best = null, bestDist = Infinity;
  for (const o of LADDER) {
    const ratio = o.kg / x;
    if (ratio < 0.72 || ratio > 1.4) continue;
    const dist = Math.abs(Math.log(ratio));
    if (dist < bestDist) { best = o; bestDist = dist; }
  }
  return best ? best.name : null;
}

/** "about the weight of an average book", or '' when nothing is close. */
export function weightPhrase(kg) {
  const n = compareKg(kg);
  return n ? `about the weight of ${n}` : '';
}

export const LADDER_NAMES = LADDER.map(o => o.name);
