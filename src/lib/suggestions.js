/**
 * suggestions.js — proactive, offline suggestions for a diary day (fork).
 *
 * Pure functions (no I/O, no stores) so they are unit-tested in
 * scripts/suggestions.test.js. Two kinds of suggestion:
 *
 *   swap : a full-sugar drink that has a zero-sugar twin. The user's own
 *          saved foods are checked first ("Coke" → their saved "Coke Zero"),
 *          then a built-in generic. Shows what the swap saves.
 *   gap  : protein is behind for the day. Suggests a few foods that close
 *          the gap without blowing the calorie goal, preferring foods the
 *          user already logs, then the built-in USDA list.
 *
 * Works for today and for days still ahead (planning). Past days get nothing:
 * advice about food already eaten is noise. Describes and offers; never
 * scolds, never hides anything, always one tap to ignore.
 */

import { isAllowed } from './food-safety.js';

const r0 = (n) => Math.round(n);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/**
 * How pushy suggestions are. Gentle only speaks up for big wins and waits until
 * mid-afternoon to talk about protein; Thorough also notices smaller ones.
 */
export const LEVELS = {
  // nutrientRatio: how close to a daily limit before speaking up (1 = only once over it)
  gentle:   { label: 'Gentle',   minSugarG: 25, minSaveKcal: 60, minGapG: 30, minFiberGapG: 14, ideas: 2, minHourToday: 15, nutrientRatio: 1.0,  nutrientRows: 1 },
  balanced: { label: 'Balanced', minSugarG: 12, minSaveKcal: 30, minGapG: 15, minFiberGapG: 9,  ideas: 3, minHourToday: 0,  nutrientRatio: 0.85, nutrientRows: 2 },
  thorough: { label: 'Thorough', minSugarG: 6,  minSaveKcal: 15, minGapG: 8,  minFiberGapG: 5,  ideas: 4, minHourToday: 0,  nutrientRatio: 0.7,  nutrientRows: 3 },
};
export const levelOf = (name) => LEVELS[name] || LEVELS.balanced;

/** Lower-case, trimmed, punctuation-light key for a food name. */
export const mutedKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** True when a food matches anything on the "never suggest" list (either contains the other). */
export function isMuted(name, muted = []) {
  const k = mutedKey(name);
  if (!k) return false;
  return (muted || []).some(m => {
    const mk = mutedKey(m);
    return mk.length >= 3 && (k === mk || k.includes(mk) || (k.length >= 3 && mk.includes(k)));
  });
}

/** Nutrients the engine reads from a food (quantity-scaled). */
export const KEYS = ['calories', 'proteins', 'sugars', 'carbohydrates', 'fat', 'saturated-fat', 'sodium', 'fiber'];
const zero = () => Object.fromEntries(KEYS.map(k => [k, 0]));
const add = (a, b) => { for (const k of KEYS) a[k] += b[k]; return a; };

/** Per-item totals for the keys we use (quantity-scaled; split recipes summed). */
export function itemTotals(item) {
  const out = zero();
  if (!item) return out;
  if (Array.isArray(item._splitItems) && item._splitItems.length) {
    for (const c of item._splitItems) add(out, itemTotals(c));
    return out;
  }
  const q = num(item.quantity) || 1;
  const n = item.nutrition || {};
  for (const k of KEYS) out[k] = num(n[k]) * q;
  return out;
}

export function dayTotals(items) {
  const out = zero();
  for (const i of items || []) add(out, itemTotals(i));
  return out;
}

/** 'past' | 'today' | 'future' for 'YYYY-MM-DD' strings. */
export function dayState(date, today) {
  if (!date || !today) return 'today';
  return date < today ? 'past' : date > today ? 'future' : 'today';
}

/* ── Swaps ──────────────────────────────────────────────────────────── */

const SWEET_DRINK = [
  ['energy',  /\b(red ?bull|monster|rockstar|bang|celsius|energy drink|energy)\b/i],
  ['tea',     /\b(sweet(ened)? (iced )?tea|iced tea|arizona|snapple|lipton|pure leaf|nestea|brisk)\b/i],
  ['soda',    /\b(soda|cola|coke|pepsi|sprite|7 ?up|fanta|dr\.? ?pepper|mountain dew|mtn dew|root beer|ginger ale|crush|sunkist|mug|a&w|fresca|surge|big red)\b/i],
  ['sweet',   /\b(lemonade|fruit punch|juice drink|kool.?aid|hi-?c|sunny ?d|capri ?sun|gatorade|powerade|sports drink|frappuccino|sweet(ened)? drink)\b/i],
];
const ALREADY_LIGHT = /\b(zero|diet|sugar[- ]?free|no sugar|0 ?sugar|unsweetened|light|lite|max|skinny)\b/i;

const GENERIC = {
  soda:   { name: 'Zero-sugar soda',          icon: '🥤', calories: 0,  note: 'sweetened without sugar' },
  energy: { name: 'Sugar-free energy drink',  icon: '🥤', calories: 10, note: 'sugar-free' },
  tea:    { name: 'Unsweetened iced tea',     icon: '🧊', calories: 0,  note: 'no sugar' },
  sweet:  { name: 'Zero-sugar drink mix',     icon: '🥤', calories: 5,  note: 'no sugar' },
};

export function drinkKind(item) {
  const hay = `${item?.brand || ''} ${item?.name || ''}`;
  if (!hay.trim() || ALREADY_LIGHT.test(hay)) return null;
  for (const [kind, re] of SWEET_DRINK) if (re.test(hay)) return kind;
  return null;
}

/** First word of the item's brand/name that is not generic, e.g. "Coke" from "Coke Classic". */
const STOP = new Set(['the', 'original', 'classic', 'regular', 'cherry', 'vanilla', 'lime', 'orange', 'can', 'bottle']);
function keyWord(item) {
  const words = `${item?.brand || ''} ${item?.name || ''}`.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w));
  return words[0] || '';
}

/** A saved zero-sugar twin of a drink (same brand word), or null. */
export function findSavedTwin(item, saved = []) {
  const k = keyWord(item);
  if (!k) return null;
  return (saved || []).find(f => {
    if (!f || f.deleted_at) return false;
    const hay = `${f.brand || ''} ${f.name || ''}`;
    if (!hay.toLowerCase().includes(k)) return false;
    if (!ALREADY_LIGHT.test(hay)) return false;
    return num(f.nutrition?.sugars) < 2;
  }) || null;
}

/**
 * Swap suggestions for the day's items.
 * @returns {Array<{id,kind:'swap',itemIndex,from,to,savesKcal,savesSugar,source}>}
 */
export function findSwaps(items, saved = [], { level = 'balanced', muted = [], ignoreMuted = false, prefs = null } = {}) {
  const L = levelOf(level);
  const out = [];
  (items || []).forEach((item, itemIndex) => {
    if (!item || item.type === 'quick_calories') return;
    if (!ignoreMuted && isMuted(item.name, muted)) return;
    const kind = drinkKind(item);
    if (!kind) return;
    const t = itemTotals(item);
    const sugarKnown = item.nutrition && item.nutrition.sugars != null;
    // A real sugar figure must clear the bar; with none on record, calories stand in.
    if (sugarKnown ? t.sugars < L.minSugarG : t.calories < L.minSugarG * 6.5) return;

    const twin = findSavedTwin(item, (saved || []).filter(f => isAllowed(f, prefs)));
    let to;
    if (twin) {
      to = { ...twin, quantity: num(item.quantity) || 1 };
    } else {
      const g = GENERIC[kind];
      to = {
        name: g.name, brand: '', icon: g.icon, portion: item.portion || 12, unit: item.unit || 'fl oz',
        quantity: num(item.quantity) || 1,
        nutrition: { calories: g.calories, proteins: 0, carbohydrates: 0, fat: 0, sugars: 0 },
        categories: [], _source: 'swap',
      };
    }
    const tt = itemTotals(to);
    const savesKcal = r0(t.calories - tt.calories);
    const savesSugar = r0(t.sugars - tt.sugars);
    if (savesKcal < L.minSaveKcal && savesSugar < L.minSugarG) return;
    out.push({
      id: `swap:${item.uuid || itemIndex}:${(item.name || '').toLowerCase()}`,
      kind: 'swap', itemIndex, from: item, to, savesKcal, savesSugar, source: twin ? 'saved' : 'generic',
    });
  });
  return out;
}

/* ── Protein gap ────────────────────────────────────────────────────── */

/** What counts as a good source of each nutrient we suggest foods for. */
export const GAP_SPEC = {
  proteins: { label: 'protein', unit: 'g', minPerServing: 8, minPerKcal: 0.075, gapKey: 'minGapG' },
  fiber:    { label: 'fiber',   unit: 'g', minPerServing: 4, minPerKcal: 0.03,  gapKey: 'minFiberGapG' },
};
const NOT_A_FIT = /\b(chips?|cookie|candy|cake|donut|doughnut|ice cream|soda|juice|bar)\b/i;

function candidateFrom(food, nutrient, { saved }) {
  const spec = GAP_SPEC[nutrient];
  const n = food?.nutrition || {};
  const p = num(n[nutrient]), k = num(n.calories);
  if (!food?.name || k <= 0 || p < spec.minPerServing) return null;
  if (p / k < spec.minPerKcal) return null;
  if (NOT_A_FIT.test(food.name) && !/protein|fiber/i.test(food.name)) return null;
  return { food, amount: r0(p), protein: nutrient === 'proteins' ? r0(p) : undefined, kcal: r0(k), saved: !!saved, uses: num(food.usage_count) };
}

/**
 * Foods that would close a gap in a "get enough" nutrient (protein, fiber).
 * @param {object} p
 * @param {Array}  p.items        the day's diary items
 * @param {number|null} p.goal    the day's target for the nutrient
 * @param {'proteins'|'fiber'} p.nutrient
 * @param {number|null} p.calorieGoal
 * @param {Array}  p.saved        the user's saved foods
 * @param {Array}  p.common       built-in foods already converted to app foods
 */
export function findGapIdeas({ nutrient = 'proteins', goal = null, items = [], calorieGoal = null, saved = [], common = [], limit, level = 'balanced', muted = [], prefs = null } = {}) {
  const L = levelOf(level);
  limit = limit ?? L.ideas;
  if (!(goal > 0)) return { gap: 0, ideas: [], tight: false };
  const t = dayTotals(items);
  const gap = r0(goal - t[nutrient]);
  if (gap < L[GAP_SPEC[nutrient].gapKey]) return { gap: Math.max(gap, 0), ideas: [], tight: false };

  const calLeft = calorieGoal > 0 ? calorieGoal - t.calories : null;
  const tight = calLeft != null && calLeft < 150;
  const kcalCap = calLeft == null ? Infinity : Math.max(calLeft * 1.1 + 40, 150);
  const eaten = new Set((items || []).map(i => String(i?.name || '').toLowerCase()));

  const pool = [];
  for (const f of saved || []) { if (f && !f.deleted_at) { const c = candidateFrom(f, nutrient, { saved: true }); if (c) pool.push(c); } }
  for (const f of common || []) { const c = candidateFrom(f, nutrient, { saved: false }); if (c) pool.push(c); }

  const scored = pool
    .filter(c => c.kcal <= kcalCap && !eaten.has(c.food.name.toLowerCase()) && !isMuted(c.food.name, muted) && isAllowed(c.food, prefs))
    .map(c => {
      const density = c.amount / c.kcal;
      const useful = Math.min(c.amount, gap);
      const calFit = calLeft == null ? 0 : (c.kcal / Math.max(calLeft, 150)) * 10;
      // Foods you already log beat a slightly better stranger, but only once they are habits.
      const score = useful + density * (nutrient === 'fiber' ? 120 : 40) + (c.saved ? 12 + Math.min(c.uses, 10) * 2 : 0) - calFit;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);

  // One idea per "kind" of food (first word), so three egg variants don't crowd out the rest.
  const seen = new Set();
  const ideas = [];
  for (const c of scored) {
    const key = c.food.name.toLowerCase().split(/[ ,]/)[0];
    if (seen.has(key)) continue;
    seen.add(key);
    ideas.push(c);
    if (ideas.length >= limit) break;
  }
  return { gap, ideas, tight };
}

/** Protein ideas (kept for callers and tests): findGapIdeas for protein. */
export function findProteinIdeas({ proteinGoal = null, ...rest } = {}) {
  return findGapIdeas({ ...rest, nutrient: 'proteins', goal: proteinGoal });
}

/* ── Putting it together for one day ───────────────────────────────── */

/**
 * @param {object} p
 * @param {string} p.date  @param {string} p.today  ('YYYY-MM-DD')
 * @param {boolean} p.completed  the user marked the day complete
 * @param {{swaps:boolean, protein:boolean}} p.enabled
 * @param {Set<string>|string[]} p.dismissed  ids hidden for this day
 */
export function suggestForDay({
  date, today, items = [], completed = false, proteinGoal = null, calorieGoal = null,
  saved = [], common = [], enabled = { swaps: true, protein: true }, dismissed = [],
  level = 'balanced', muted = [], hour = new Date().getHours(), prefs = null,
} = {}) {
  const state = dayState(date, today);
  const hidden = new Set(dismissed || []);
  const out = { state, swaps: [], protein: null, planning: false };
  if (state === 'past' || completed) return out;

  if (enabled.swaps && items.length) out.swaps = findSwaps(items, saved, { level, muted, prefs }).filter(s => !hidden.has(s.id));

  if (enabled.protein) {
    // An empty day is only worth a nudge when it is a day still being planned.
    // Gentle waits until the afternoon to talk about today's protein; planning a future day is always fair.
    const tooEarly = state === 'today' && hour < levelOf(level).minHourToday;
    if ((items.length || state === 'future') && !tooEarly) {
      const ideas = findProteinIdeas({ items, proteinGoal, calorieGoal, saved, common, level, muted, prefs });
      const id = `protein:${date}`;
      if (ideas.ideas.length && !hidden.has(id)) out.protein = { id, ...ideas };
      out.planning = state === 'future' && !items.length;
    }
  }
  return out;
}

/** Meal slot a suggested food goes to: time of day for today, the emptiest meal for another day. */
export function mealForSuggestion({ state, items = [], mealCount = 4, timeMeal = 0 }) {
  if (state === 'today') return Math.min(timeMeal, Math.max(0, mealCount - 1));
  const counts = Array.from({ length: Math.max(1, mealCount) }, () => 0);
  for (const i of items) { const m = Number(i?.meal) || 0; if (m < counts.length) counts[m]++; }
  // Prefer lunch/dinner-type slots (1, 2) when they tie for emptiest.
  const order = [1, 2, 0, 3].filter(m => m < counts.length);
  let best = order[0] ?? 0;
  for (const m of order) if (counts[m] < counts[best]) best = m;
  return best;
}
