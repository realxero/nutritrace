/**
 * day-plan.js — "plan my whole day" (fork).
 *
 * Offline and deterministic: from what is left of today's (or a future day's)
 * calories and protein, build a simple meal plan out of the built-in foods and the
 * user's own habits, honouring allergies, diet, dislikes and never-suggest foods.
 * Every item comes with a few alternatives ("swap") that keep the calories about
 * the same. "Shuffle" (a new seed) gives a different plan.
 *
 * It is a starting point, not a prescription: portions land within roughly 10% of
 * the targets, and anything that does not (protein short, a limit exceeded) is
 * said plainly in `notes`.
 */
import { COMMON_FOODS, commonFoodToFood, searchCommonFoodsScored } from './common-foods.js';
import { itemTotals, isMuted } from './suggestions.js';
import { isAllowed } from './food-safety.js';
import { servingSense } from './serving-sense.js';

const r0 = (n) => Math.round(n);
const half = (n) => Math.round(n * 2) / 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Hand-picked roles over the built-in food names (checked against the library in the tests). */
export const ROLES = {
  'breakfast-protein': ['Egg, scrambled', 'Egg, hard-boiled', 'Egg whites', 'Greek yogurt, plain nonfat', 'Cottage cheese, 2%', 'Yogurt, plain whole milk', 'Egg, fried', 'Tofu, firm'],
  'breakfast-starch':  ['Oatmeal, cooked with water', 'Whole wheat bread', 'English muffin', 'Rolled oats, dry', 'Sourdough bread', 'Bagel, plain', 'Pancakes', 'Waffle', 'Corn tortilla'],
  protein: ['Chicken breast, cooked', 'Turkey breast, roasted', 'Salmon, cooked', 'Tuna, canned in water', 'Ground turkey, cooked', 'Steak (sirloin), cooked', 'Shrimp, cooked', 'Tofu, firm',
            'Cod, cooked', 'Tilapia, cooked', 'Chicken thigh, cooked', 'Ground beef 93/7, cooked', 'Pork chop, cooked', 'Black beans, cooked', 'Lentils, cooked', 'Chickpeas, cooked', 'Egg, hard-boiled'],
  starch:  ['White rice, cooked', 'Brown rice, cooked', 'Quinoa, cooked', 'Pasta, cooked', 'Whole wheat pasta, cooked', 'Potato, baked', 'Sweet potato, baked', 'Flour tortilla', 'Corn tortilla'],
  veg:     ['Broccoli, cooked', 'Spinach', 'Green beans', 'Asparagus', 'Bell pepper, red', 'Zucchini', 'Cauliflower', 'Carrot', 'Kale', 'Brussels sprouts', 'Cherry tomatoes', 'Mushrooms', 'Romaine lettuce', 'Cucumber', 'Peas, green', 'Corn, sweet'],
  fruit:   ['Apple', 'Banana', 'Orange', 'Strawberries', 'Blueberries', 'Grapes', 'Pear', 'Peach', 'Kiwi', 'Raspberries', 'Mango', 'Pineapple', 'Clementine'],
  'snack-protein': ['Greek yogurt, plain nonfat', 'Cottage cheese, 2%', 'Edamame', 'Egg, hard-boiled', 'Almonds', 'Peanuts, dry roasted', 'Hummus', 'Cheddar cheese', 'Mozzarella, part-skim', 'Turkey breast, roasted', 'Tuna, canned in water', 'Pistachios'],
  fat:     ['Avocado', 'Almonds', 'Peanut butter', 'Walnuts', 'Almond butter', 'Pistachios', 'Olive oil'],
};

const TEMPLATES = {
  breakfast: ['breakfast-protein', 'breakfast-starch', 'fruit'],
  lunch:     ['protein', 'starch', 'veg'],
  dinner:    ['protein', 'starch', 'veg'],
  snack:     ['snack-protein', 'fruit'],
};
const SHARE = { breakfast: 0.25, lunch: 0.32, dinner: 0.33, snack: 0.10 };
/** Which roles flex to hit the calories (first = grown first), and which shrink first. */
const GROW = ['dish', 'starch', 'breakfast-starch', 'fruit', 'fat', 'protein', 'breakfast-protein', 'snack-protein', 'veg'];
const SHRINK = ['fat', 'dish', 'starch', 'breakfast-starch', 'fruit', 'veg', 'protein', 'breakfast-protein', 'snack-protein'];

/** A meal slot's kind, from its name, else its position. */
export function mealKind(name, idx) {
  const n = String(name || '').toLowerCase();
  if (/break|morning|brunch/.test(n)) return 'breakfast';
  if (/lunch|noon/.test(n)) return 'lunch';
  if (/dinner|supper|evening/.test(n)) return 'dinner';
  if (/snack|dessert|treat/.test(n)) return 'snack';
  return ['breakfast', 'lunch', 'dinner'][idx] || 'snack';
}

const _lib = new Map(COMMON_FOODS.map(e => [e.name, e]));
const _foodCache = new Map();
const libFood = (name) => {
  if (!_foodCache.has(name)) { const e = _lib.get(name); _foodCache.set(name, e ? commonFoodToFood(e) : null); }
  return _foodCache.get(name);
};

// Small stable hash so "Shuffle" varies the pick without randomness (same seed = same plan).
const jitter = (seed, s) => { let h = 2166136261 ^ seed; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };

const per = (food) => itemTotals({ nutrition: food.nutrition, quantity: 1 });

/* ── The user's own foods, meals and recipes ─────────────────────────────── */

const FRUIT_RE = /\b(apple|banana|orange|berry|berries|strawberr\w*|blueberr\w*|raspberr\w*|grapes?|pears?|peach\w*|mango\w*|pineapple|kiwi|melon|cherr\w*|plum|clementine|fruit)\b/i;
const VEG_RE = /\b(broccoli|spinach|kale|lettuce|salad|carrots?|peppers?|zucchini|cauliflower|asparagus|cucumber|tomato\w*|mushrooms?|green beans?|brussels|cabbage|celery|veggies?|vegetables?)\b/i;
const SKIP_RE = /\b(soda|cola|juice|candy|chocolate|cookie|cake|donut|doughnut|ice cream|chips|fries|beer|wine|vodka|whiskey|liquor|syrup|sugar|honey|sauce|dressing|ketchup|mayo|oil|butter|cream|pizza|brownie|pastry|pie|seasoning|spice|coffee|tea|water)\b/i;
const BREAKFASTY = /\b(yogurt|yoghurt|skyr|egg|eggs|cottage|tofu|oat|oatmeal|cereal|granola|toast|bagel|muffin|bread|waffle|pancake)\b/i;

/**
 * Which plan roles a food of the user's can fill. A built-in match (the same food saved
 * earlier) keeps the built-in roles; anything else is judged by its name and its macros
 * per serving. An empty list means "not a planning food" (sauces, sweets, drinks...).
 */
export function classifyRole(food) {
  if (!food || !food.name) return [];
  if (servingSense(food).scaled) return [];                // a powder, jerky or nuts saved at "100 g" is not a meal component
  const name = String(food.name);
  const [best] = searchCommonFoodsScored(name, 1);
  if (best && best.score >= 85) {
    const roles = Object.keys(ROLES).filter(r => ROLES[r].includes(best.entry.name));
    if (roles.length) return roles;
  }
  const t = itemTotals({ nutrition: food.nutrition, quantity: 1 });
  const kcal = t.calories, p = t.proteins, c = t.carbohydrates, f = t.fat;
  if (!(kcal > 0)) return [];
  const protein = /protein|whey/i.test(name);
  if (SKIP_RE.test(name) && !protein) return [];
  const roles = [];
  if (kcal >= 300 && kcal <= 900 && p >= 15 && c >= 20) roles.push('dish');                   // a complete meal in one food
  else if (FRUIT_RE.test(name) && kcal <= 250) roles.push('fruit');
  else if (VEG_RE.test(name) && kcal <= 150) roles.push('veg');
  else if (p >= 10 && p / kcal >= 0.075 && kcal <= 500) {
    roles.push('protein');
    if (BREAKFASTY.test(name) || protein) roles.push('breakfast-protein');
    if (kcal <= 250) roles.push('snack-protein');
  } else if (/\b(bar|jerky|nuts?|almonds?|trail)\b/i.test(name) && p >= 5 && kcal <= 300) roles.push('snack-protein');
  else if ((c * 4) / kcal >= 0.6 && p / kcal < 0.075 && kcal >= 80 && kcal <= 450) {
    roles.push('starch');
    if (BREAKFASTY.test(name)) roles.push('breakfast-starch');
  } else if ((f * 9) / kcal >= 0.6 && kcal <= 250) roles.push('fat');
  return roles;
}

/** A saved meal or recipe as something the planner can place as one dish. */
export function dishFromMeal(m, isRecipe = false) {
  if (!m || !m.name || m.deleted_at) return null;
  const n = m.nutrition && typeof m.nutrition === 'object' ? m.nutrition : null;
  if (!n || !(parseFloat(n.calories) > 0)) return null;
  const kcal = parseFloat(n.calories);
  if (kcal < 120 || kcal > 1400) return null;
  return { ...m, kind: isRecipe ? 'recipe' : 'meal', portion: isRecipe ? (m.portion || 1) : 1, unit: isRecipe ? (m.unit || 'serving') : 'meal',
    nutrition: n, _dish: true, _mealItems: isRecipe ? null : (Array.isArray(m.items) ? m.items : []) };
}

/** role → the user's own candidates (brands, saved foods, dishes). Built-in copies saved earlier are left to the built-in list. */
export function userPools({ saved = [], dishes = [] } = {}) {
  const pools = new Map();
  const add = (role, entry) => { if (!pools.has(role)) pools.set(role, []); pools.get(role).push(entry); };
  for (const f of saved || []) {
    if (!f || f.deleted_at || !f.name || f.brand === 'USDA' || !f.nutrition) continue;
    for (const role of classifyRole(f)) add(role, { name: f.name, food: f, habit: Number(f.usage_count) || 0 });
  }
  for (const d of dishes || []) if (d && d._dish) add('dish', { name: d.name, food: d, habit: Number(d.usage_count) || 0 });
  return pools;
}

function candidatesFor(role, { prefs, muted, used, habit, seed, wantProtein, pools }) {
  const out = [];
  const seenNames = new Set();
  for (const name of ROLES[role] || []) {
    const food = libFood(name);
    if (!food || used.has(name) || isMuted(name, muted) || !isAllowed(food, prefs)) continue;
    const t = per(food);
    if (!(t.calories > 0)) continue;
    const density = t.proteins / t.calories;
    let score = jitter(seed, `${role}|${name}`) * 1.6;                                   // variety
    score += Math.min(habit.get(name.toLowerCase()) || 0, 12) * 0.35;                     // foods they already log
    if (wantProtein) score += Math.min(density * 8, 2);                                   // lean protein first
    out.push({ name, food, score });
    seenNames.add(name.toLowerCase());
  }
  // Their own foods, brands, meals and recipes. A little ahead of the built-ins, more so the more they use them.
  for (const u of (pools && pools.get(role)) || []) {
    const name = u.name;
    if (!name || seenNames.has(name.toLowerCase()) || used.has(name) || isMuted(name, muted) || !isAllowed(u.food, prefs)) continue;
    const t = per(u.food);
    if (!(t.calories > 0)) continue;
    let score = jitter(seed, `${role}|${name}`) * 1.6 + 0.8 + Math.min(u.habit, 12) * 0.35;
    if (wantProtein) score += Math.min((t.proteins / t.calories) * 8, 2);
    out.push({ name, food: u.food, score, yours: true });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Alternatives for an item: same role, calories matched by quantity. */
function altsFor(role, chosen, kcalTarget, ctx) {
  const used = new Set(ctx.used); used.delete(chosen.name);
  return candidatesFor(role, { ...ctx, used }).filter(c => c.name !== chosen.name).slice(0, 3).map(c => {
    const t = per(c.food);
    return { food: c.food, quantity: clamp(half(kcalTarget / t.calories), 0.5, 4), yours: !!c.yours };
  });
}

function itemOf(role, name, food, quantity, ctx, kcalForAlts, yours = false) {
  const t = itemTotals({ nutrition: food.nutrition, quantity });
  return { id: `${role}:${name}`, role, food, quantity, kcal: r0(t.calories), protein: r0(t.proteins), alts: [], yours, _kcalForAlts: kcalForAlts };
}

const kcalOf = (items) => items.reduce((a, i) => a + itemTotals({ nutrition: i.food.nutrition, quantity: i.quantity }).calories, 0);
const prot = (items) => items.reduce((a, i) => a + itemTotals({ nutrition: i.food.nutrition, quantity: i.quantity }).proteins, 0);

/**
 * Bring a meal's calories to within ~8% of its target by nudging portions by half a serving.
 * Protein is only grown while the meal is still under ~130% of its protein share (no "3 cans of tuna"),
 * and if every portion is maxed out, one filler item (a fat or nut) is added instead.
 */
function fitMeal(items, targetKcal, { proteinTarget = Infinity, filler = null } = {}) {
  let filled = false;
  for (let guard = 0; guard < 30; guard++) {
    const diff = targetKcal - kcalOf(items);
    if (Math.abs(diff) <= targetKcal * 0.08) break;
    const order = diff > 0 ? GROW : SHRINK;
    const proteinFull = prot(items) >= proteinTarget * 1.3;
    let moved = false;
    for (const role of order) {
      if (diff > 0 && proteinFull && /protein/.test(role)) continue;
      const it = items.find(i => i.role === role && (diff > 0 ? i.quantity < 3 : i.quantity > 0.5));
      if (!it) continue;
      const step = diff > 0 ? 0.5 : -0.5;
      const k = itemTotals({ nutrition: it.food.nutrition, quantity: Math.abs(step) }).calories;
      if (diff > 0 && k > diff * 1.6) continue;           // don't overshoot with one big step
      it.quantity += step; moved = true; break;
    }
    if (!moved) {
      if (diff > 0 && !filled && filler) { const f = filler(); filled = true; if (f) { items.push(f); continue; } }
      break;
    }
  }
}

function refresh(it) {
  const t = itemTotals({ nutrition: it.food.nutrition, quantity: it.quantity });
  it.kcal = r0(t.calories); it.protein = r0(t.proteins);
}

export function planTotals(plan) {
  const all = plan.meals.flatMap(m => m.items.map(i => itemTotals({ nutrition: i.food.nutrition, quantity: i.quantity })));
  const sum = (k) => all.reduce((a, t) => a + t[k], 0);
  return { calories: r0(sum('calories')), proteins: r0(sum('proteins')), sodium: r0(sum('sodium')), fiber: r0(sum('fiber')), 'saturated-fat': Math.round(sum('saturated-fat') * 10) / 10, fat: r0(sum('fat')), sugars: r0(sum('sugars')) };
}

/**
 * @param {object} p
 * @param {Array<{idx:number,name:string,hasItems?:boolean}>} p.meals   the day's meal slots; ones with items are left alone
 * @param {{calories:number, protein:number|null}} p.remaining          what is left to plan for
 * @param {object} p.limits  { sodium, 'saturated-fat', fiber } the user's goals, for the notes
 * @param {object} p.prefs   allergies, diet, dislikes (lib/food-safety.js)
 * @param {Array}  p.saved   the user's saved foods (their habits nudge the picks)
 * @param {string[]} p.muted never-suggest foods
 * @param {Array}  p.dishes  saved meals and recipes as dishes (see dishFromMeal)
 * @param {string[]} p.usedNames foods to avoid repeating (yesterday's, when planning a week)
 * @param {number} p.seed    0 first, then 1, 2… for "Shuffle"
 */
export function planDay({ meals = [], remaining = {}, limits = {}, prefs = null, saved = [], dishes = [], muted = [], seed = 0, usedNames = [] } = {}) {
  const kcalLeft = Number(remaining.calories);
  if (!(kcalLeft > 0)) return { needsGoal: !Number.isFinite(kcalLeft), meals: [], totals: null, targets: null, notes: [], full: Number.isFinite(kcalLeft) };

  const slots = meals.filter(m => !m.hasItems);
  if (!slots.length) return { needsGoal: false, meals: [], totals: null, targets: { calories: r0(kcalLeft), protein: null }, notes: ['Every meal already has food in it.'], full: false, allFilled: true };

  const proteinLeft = Number(remaining.protein) > 0 ? Number(remaining.protein) : (kcalLeft * 0.25) / 4;
  const proteinDefault = !(Number(remaining.protein) > 0);

  const habit = new Map();
  for (const f of saved || []) if (f && !f.deleted_at && f.usage_count) habit.set(String(f.name || '').toLowerCase(), f.usage_count);

  const kinds = slots.map(m => mealKind(m.name, m.idx));
  const shareSum = kinds.reduce((a, k) => a + SHARE[k], 0);
  const used = new Set(usedNames || []);
  const pools = userPools({ saved, dishes });
  const ctx = { prefs, muted, used, habit, seed, pools };
  const notes = [];
  const out = [];

  slots.forEach((slot, n) => {
    const kind = kinds[n];
    const w = SHARE[kind] / shareSum;
    const target = { kcal: r0(kcalLeft * w), protein: r0(proteinLeft * w) };
    const items = [];
    // A saved meal or recipe can stand in for the whole lunch or dinner, on alternate shuffles.
    const useDish = (kind === 'lunch' || kind === 'dinner') && (seed + n) % 2 === 0 && candidatesFor('dish', ctx).length > 0;
    for (const role of useDish ? ['dish', 'veg'] : TEMPLATES[kind]) {
      const pick = candidatesFor(role, { ...ctx, wantProtein: /protein/.test(role) })[0];
      if (!pick) { notes.push(`No ${role.replace('-', ' ')} option fits your preferences for ${slot.name}.`); continue; }
      used.add(pick.name);
      const t = per(pick.food);
      let q = 1;
      if (/protein/.test(role) && t.proteins > 0) q = clamp(half((target.protein * 0.7) / t.proteins), 0.5, 3);
      if (role === 'veg') q = 1;
      if (role === 'dish' && t.calories > 0) q = clamp(half((target.kcal * 0.85) / t.calories), 0.5, 2);
      items.push({ ...itemOf(role, pick.name, pick.food, q, ctx, undefined, !!pick.yours), _pick: pick.name });
    }
    if (!items.length) return;
    fitMeal(items, target.kcal, {
      proteinTarget: target.protein,
      filler: () => {
        const pick = candidatesFor('fat', { ...ctx })[0];
        if (!pick) return null;
        used.add(pick.name);
        const t = per(pick.food);
        return itemOf('fat', pick.name, pick.food, clamp(half((target.kcal * 0.12) / t.calories), 0.5, 2), ctx, undefined, !!pick.yours);
      },
    });
    for (const it of items) { refresh(it); it.alts = altsFor(it.role, { name: it._pick }, it.kcal, ctx); delete it._kcalForAlts; delete it._pick; }
    out.push({ idx: slot.idx, name: slot.name, kind, target, items });
  });

  const plan = { needsGoal: false, meals: out, targets: { calories: r0(kcalLeft), protein: r0(proteinLeft), proteinDefault } };
  topUpProtein(plan, ctx, kinds);
  plan.totals = planTotals(plan);
  plan.notes = [...notes, ...planNotes(plan, limits)];
  return plan;
}

/** If protein lands well short, grow the main protein, then add a protein snack. */
function topUpProtein(plan, ctx) {
  const need = () => plan.targets.protein - plan.meals.reduce((a, m) => a + prot(m.items), 0);
  for (let guard = 0; guard < 8 && need() > plan.targets.protein * 0.1; guard++) {
    const it = plan.meals.flatMap(m => m.items).filter(i => /protein/.test(i.role) && i.quantity < 2).sort((a, b) => a.quantity - b.quantity)[0];
    if (!it) break;
    it.quantity += 0.5; refresh(it);
  }
  if (need() > plan.targets.protein * 0.1) {
    const pick = candidatesFor('snack-protein', { ...ctx, wantProtein: true })[0];
    const host = plan.meals.find(m => m.kind === 'snack') || [...plan.meals].sort((a, b) => kcalOf(a.items) - kcalOf(b.items))[0];
    if (pick && host) {
      ctx.used.add(pick.name);
      const it = itemOf('snack-protein', pick.name, pick.food, 1, ctx, undefined, !!pick.yours);
      it.alts = altsFor('snack-protein', { name: pick.name }, it.kcal, ctx);
      host.items.push(it);
    }
  }
  // Trim starch if the top-up pushed the day over its calories.
  for (let guard = 0; guard < 6; guard++) {
    const total = plan.meals.reduce((a, m) => a + kcalOf(m.items), 0);
    if (total <= plan.targets.calories * 1.06) break;
    const it = plan.meals.flatMap(m => m.items).filter(i => /starch|fruit|fat/.test(i.role) && i.quantity > 0.5).sort((a, b) => b.kcal - a.kcal)[0];
    if (!it) break;
    it.quantity -= 0.5; refresh(it);
  }
}

function planNotes(plan, limits) {
  const notes = [];
  const t = plan.totals, tg = plan.targets;
  if (t.calories < tg.calories * 0.9) notes.push(`About ${tg.calories - t.calories} kcal under your target. Add a serving anywhere you like.`);
  if (t.calories > tg.calories * 1.1) notes.push(`About ${t.calories - tg.calories} kcal over your target.`);
  if (t.proteins < tg.protein * 0.9) notes.push(`Protein lands about ${tg.protein - t.proteins} g short of ${tg.proteinDefault ? 'a typical target' : 'your goal'}.`);
  const sodium = Number(limits?.sodium) > 0 ? Number(limits.sodium) : 2300;
  if (t.sodium > sodium) notes.push(`Sodium comes to ${t.sodium.toLocaleString()} mg, over ${Number(limits?.sodium) > 0 ? 'your goal' : 'the standard 2,300 mg'}.`);
  const sat = Number(limits?.['saturated-fat']) > 0 ? Number(limits['saturated-fat']) : 20;
  if (t['saturated-fat'] > sat) notes.push(`Saturated fat comes to ${t['saturated-fat']} g, over ${Number(limits?.['saturated-fat']) > 0 ? 'your goal' : 'the standard 20 g'}.`);
  return notes;
}

/** Swap one item for one of its alternatives (a new plan; the old one is untouched). */
export function swapPlanItem(plan, mealPos, itemPos, altPos) {
  const next = { ...plan, meals: plan.meals.map(m => ({ ...m, items: m.items.map(i => ({ ...i, alts: [...i.alts] })) })) };
  const it = next.meals[mealPos]?.items[itemPos];
  const alt = it?.alts[altPos];
  if (!it || !alt) return plan;
  const old = { food: it.food, quantity: it.quantity };
  const oldKcal = it.kcal;
  const wasYours = !!it.yours;
  it.food = alt.food; it.quantity = alt.quantity; it.id = `${it.role}:${alt.food.name}`; it.yours = !!alt.yours;
  refresh(it);
  // The old choice becomes an alternative, at the quantity that matches the new calories.
  const t = itemTotals({ nutrition: old.food.nutrition, quantity: 1 });
  it.alts.splice(altPos, 1, { food: old.food, quantity: clamp(half(it.kcal / Math.max(t.calories, 1)), 0.5, 4), yours: wasYours });
  void oldKcal;
  next.totals = planTotals(next);
  next.notes = planNotes(next, {});
  return next;
}

export function removePlanItem(plan, mealPos, itemPos) {
  const next = { ...plan, meals: plan.meals.map((m, mi) => mi === mealPos ? { ...m, items: m.items.filter((_, i) => i !== itemPos) } : m) };
  next.meals = next.meals.filter(m => m.items.length);
  next.totals = planTotals(next);
  next.notes = planNotes(next, {});
  return next;
}

/**
 * What gets added to the diary: one row per item. A saved meal is expanded into its
 * ingredients (as logging a meal does everywhere else in the app); a recipe is one row.
 */
export function planToDiaryRows(plan, { onlyMeal = null } = {}) {
  const rows = [];
  for (const m of plan.meals) {
    if (onlyMeal != null && m.idx !== onlyMeal) continue;
    for (const i of m.items) {
      const ing = i.food && i.food._mealItems;
      if (Array.isArray(ing) && ing.length) {
        for (const x of ing) rows.push({ meal: m.idx, food: x, quantity: (parseFloat(x.quantity) || 1) * i.quantity, fromMeal: i.food.name });
      } else rows.push({ meal: m.idx, food: i.food, quantity: i.quantity });
    }
  }
  return rows;
}

/**
 * Plan several days. Each day uses its own seed and avoids repeating the day before,
 * so the week is not the same dinner seven times.
 * @param {Array<{date:string, meals:Array, remaining:object}>} days
 * @returns {Array<{date:string, plan:object}>}
 */
export function planWeek({ days = [], limits = {}, prefs = null, saved = [], dishes = [], muted = [], seed = 0 } = {}) {
  const out = [];
  let prev = [];
  days.forEach((d, i) => {
    const plan = planDay({ meals: d.meals, remaining: d.remaining, limits, prefs, saved, dishes, muted, seed: seed * 7 + i, usedNames: prev });
    prev = plan.meals ? plan.meals.flatMap(m => m.items.map(it => it.food.name)) : [];
    out.push({ date: d.date, plan });
  });
  return out;
}
