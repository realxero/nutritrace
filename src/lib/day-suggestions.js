/**
 * day-suggestions.js — everything the Diary suggestions card shows for a day (fork).
 *
 * Builds on suggestForDay (zero-sugar drink swaps, protein ideas) and adds:
 *
 *   nutrient watch : sodium, saturated fat, fat, sugar: when the day is at or
 *                    near its limit, find the biggest contributor and offer a
 *                    lighter option from the same swap family
 *                    ("Sodium is at 112% of your limit · Pizza slice → Hamburger, saves 382 mg").
 *   fiber ideas    : like protein: when fiber is behind, foods that close the gap.
 *
 * Limits come from the user's own goals when set, otherwise the standard daily
 * value (sodium 2,300 mg, saturated fat 20 g, fiber 28 g). Fat and sugar have no
 * standard figure, so they are only watched when the user set a goal for them.
 * Works for today and for days being planned; past days get nothing.
 */
import { suggestForDay, dayTotals, itemTotals, dayState, levelOf, findGapIdeas, isMuted } from './suggestions.js';
import { findBetterOptions } from './better-options.js';

const r0 = (n) => Math.round(n);

/** Nutrients that can be watched, and the standard daily value used when the user has no goal. */
export const WATCH = {
  sodium:          { label: 'Sodium',         unit: 'mg', dv: 2300 },
  'saturated-fat': { label: 'Saturated fat',  unit: 'g',  dv: 20 },
  fat:             { label: 'Fat',            unit: 'g',  dv: null },
  sugars:          { label: 'Sugar',          unit: 'g',  dv: null },
  fiber:           { label: 'Fiber',          unit: 'g',  dv: 28, min: true },
};
export const DEFAULT_WATCHED = ['sodium', 'saturated-fat', 'fat', 'sugars', 'fiber'];

/** The limit for a nutrient: the user's goal, else the standard value, else null (not watched). */
export function limitFor(nutrient, limits = {}) {
  const g = Number(limits?.[nutrient]);
  if (g > 0) return { value: g, source: 'goal' };
  const dv = WATCH[nutrient]?.dv;
  return dv ? { value: dv, source: 'standard' } : null;
}

/**
 * Over-the-limit nutrients, worst first, each with the swap that helps most.
 * @returns {Array<{id,kind:'nutrient',nutrient,label,unit,eaten,limit,ratio,over,limitSource,itemIndex,from,to,delta,why}>}
 */
export function findNutrientSwaps({ items = [], limits = {}, watched = DEFAULT_WATCHED, saved = [], level = 'balanced', muted = [], skipIndexes = new Set() } = {}) {
  const L = levelOf(level);
  const totals = dayTotals(items);
  const rows = [];
  for (const nutrient of watched) {
    const spec = WATCH[nutrient];
    if (!spec || spec.min) continue;                       // "get enough" nutrients are gap ideas, not swaps
    const lim = limitFor(nutrient, limits);
    if (!lim) continue;
    const eaten = totals[nutrient];
    const ratio = eaten / lim.value;
    if (ratio < L.nutrientRatio) continue;

    // Biggest contributors first; each must carry a real share of the day's total and of the limit.
    const contributors = items
      .map((item, itemIndex) => ({ item, itemIndex, amount: itemTotals(item)[nutrient] }))
      .filter(c => c.item && c.item.type !== 'quick_calories' && !skipIndexes.has(c.itemIndex) && !isMuted(c.item.name, muted)
        && c.amount >= eaten * 0.25 && c.amount >= lim.value * 0.1)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    for (const c of contributors) {
      const best = findBetterOptions(c.item, { focus: nutrient, saved, muted, limit: 1 }).options[0];
      if (!best) continue;
      rows.push({
        id: `nutrient:${nutrient}:${c.item.uuid || c.itemIndex}`,
        kind: 'nutrient', nutrient, label: spec.label, unit: spec.unit,
        eaten: r0(eaten), limit: r0(lim.value), ratio, over: ratio >= 1, limitSource: lim.source,
        itemIndex: c.itemIndex, from: c.item, to: best.food, delta: best.delta, why: best.why, source: best.source,
      });
      break;                                                // one suggestion per nutrient
    }
  }
  return rows.sort((a, b) => b.ratio - a.ratio).slice(0, L.nutrientRows);
}

/**
 * @param {object} p  same as suggestForDay, plus:
 * @param {object} p.limits    { sodium, 'saturated-fat', fat, sugars, fiber } the user's goals (grams / mg), null when unset
 * @param {string[]} p.watched which nutrients to watch
 * @param {boolean} p.nutrients  master switch for nutrient watch + fiber ideas
 */
export function buildDaySuggestions(p = {}) {
  const base = suggestForDay(p);
  const out = { ...base, nutrients: [], fiber: null };
  const { date, today, items = [], completed = false, saved = [], common = [], calorieGoal = null, limits = {},
    watched = DEFAULT_WATCHED, nutrients = true, dismissed = [], level = 'balanced', muted = [], hour = new Date().getHours() } = p;
  if (!nutrients || base.state === 'past' || completed) return out;
  const hidden = new Set(dismissed || []);

  if (items.length) {
    const already = new Set((base.swaps || []).map(s => s.itemIndex));   // a sugary drink is already covered
    out.nutrients = findNutrientSwaps({ items, limits, watched, saved, level, muted, skipIndexes: already })
      .filter(r => !hidden.has(r.id));
  }

  const state = dayState(date, today);
  const tooEarly = state === 'today' && hour < levelOf(level).minHourToday;
  if (watched.includes('fiber') && (items.length || state === 'future') && !tooEarly) {
    const lim = limitFor('fiber', limits);
    if (lim) {
      const r = findGapIdeas({ nutrient: 'fiber', goal: lim.value, items, calorieGoal, saved, common, level, muted });
      const id = `fiber:${date}`;
      if (r.ideas.length && !hidden.has(id)) out.fiber = { id, ...r };
    }
  }
  return out;
}
