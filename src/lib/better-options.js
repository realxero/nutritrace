/**
 * better-options.js — "a better option for my goal" for ONE food (fork).
 *
 * This is the on-demand path: it works whether or not Smart Suggestions are
 * switched on, because the user asked. Instant and offline. Real-life
 * alternatives from the AI live in ai-alternatives.js.
 *
 *   focus 'lose'     fewer calories, protein kept
 *   focus 'gain'     more calories and protein
 *   focus 'protein'  more protein for the calories
 *   focus 'balanced' less sugar or fewer calories
 *   focus 'sugars' | 'sodium' | 'fat' | 'saturated-fat'   a lot less of that nutrient
 *   focus 'fiber'    more fiber
 *
 * "Same kind of food" is a hand-picked swap family (milks, cheeses, breads,
 * meats, snacks…) that the closest built-in match belongs to. USDA's own
 * categories are far too broad (ice cream landed next to parmesan), so only
 * foods that genuinely replace each other share a family. Drinks go through
 * the zero-sugar swap rules. Anything outside a family is left to the AI.
 */
import { COMMON_FOODS, commonFoodToFood, searchCommonFoodsScored } from './common-foods.js';
import { itemTotals, findSwaps, isMuted } from './suggestions.js';

const r0 = (n) => Math.round(n);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** What the user's goal asks of a food. targetKg/currentKg in kg. */
export function goalFocus({ targetKg = null, currentKg = null, proteinGap = 0, over = null } = {}) {
  if (targetKg > 0 && currentKg > 0) {
    const diff = targetKg - currentKg;
    if (diff < -0.5) return 'lose';
    if (diff > 0.5) return 'gain';
  }
  if (over) return over;                       // a nutrient already past its limit today
  return proteinGap >= 15 ? 'protein' : 'balanced';
}

export const FOCUS_LABEL = {
  lose: 'losing weight', gain: 'gaining weight', protein: 'getting more protein', balanced: 'a balanced day',
  sugars: 'less sugar', sodium: 'less sodium', fat: 'less fat', 'saturated-fat': 'less saturated fat', fiber: 'more fiber',
};
/** Nutrients where the goal is "less of it" / "more of it". */
export const REDUCE_FOCUS = new Set(['sugars', 'sodium', 'fat', 'saturated-fat']);

/** Foods that genuinely replace one another. Names are the built-in USDA names. */
export const FAMILIES = {
  milks:    ['Milk, whole', 'Milk, 2%', 'Milk, skim', 'Soy milk', 'Almond milk, unsweetened', 'Half and half', 'Heavy cream'],
  cheeses:  ['Cheddar cheese', 'American cheese slice', 'Cream cheese', 'Mozzarella, part-skim', 'Cottage cheese, 2%', 'Parmesan, grated'],
  desserts: ['Ice cream, vanilla', 'Greek yogurt, plain nonfat', 'Yogurt, plain whole milk', 'Strawberries', 'Blueberries', 'Raspberries', 'Dark chocolate (70–85%)'],
  sweets:   ['Milk chocolate', 'Glazed donut', 'Chocolate chip cookie', 'Granola bar', 'Dark chocolate (70–85%)', 'Apple', 'Strawberries', 'Blueberries', 'Greek yogurt, plain nonfat'],
  salty:    ['Potato chips', 'Tortilla chips', 'Pretzels', 'Popcorn, air-popped'],
  starches: ['White rice, cooked', 'Brown rice, cooked', 'Pasta, cooked', 'Whole wheat pasta, cooked', 'Quinoa, cooked', 'Potato, baked', 'Sweet potato, baked'],
  breads:   ['White bread', 'Whole wheat bread', 'Sourdough bread', 'Bagel, plain', 'English muffin', 'Flour tortilla', 'Corn tortilla', 'Croissant, butter'],
  breakfast:['Pancakes', 'Waffle', 'Oatmeal, cooked with water', 'Rolled oats, dry', 'Bagel, plain', 'English muffin', 'Croissant, butter'],
  meats:    ['Ground beef 85/15, cooked', 'Ground beef 93/7, cooked', 'Ground turkey, cooked', 'Steak (sirloin), cooked', 'Chicken breast, cooked', 'Chicken thigh, cooked',
             'Chicken drumstick, cooked', 'Chicken wings, cooked', 'Turkey breast, roasted', 'Pork chop, cooked', 'Bacon, cooked', 'Ham, sliced', 'Salmon, cooked',
             'Tuna, canned in water', 'Tilapia, cooked', 'Cod, cooked', 'Shrimp, cooked'],
  eggs:     ['Egg, large', 'Egg, hard-boiled', 'Egg, scrambled', 'Egg, fried', 'Egg whites'],
  nuts:     ['Peanut butter', 'Almond butter', 'Almonds', 'Peanuts, dry roasted', 'Cashews', 'Walnuts', 'Pistachios', 'Sunflower seeds'],
  sauces:   ['Mayonnaise', 'Ranch dressing', 'Sour cream', 'Ketchup', 'Mustard', 'Salsa', 'Hummus'],
  fastfood: ['Pepperoni pizza slice', 'Cheese pizza slice', 'Hamburger (single patty)', 'Cheeseburger', 'Hot dog', 'Chicken nuggets', 'French fries', 'Burrito, bean and cheese', 'Taco, beef', 'Macaroni and cheese', 'Fried rice'],
  fruit:    ['Apple', 'Banana', 'Orange', 'Grapes', 'Pineapple', 'Mango', 'Strawberries', 'Blueberries', 'Raspberries', 'Watermelon', 'Cantaloupe', 'Peach', 'Pear', 'Kiwi', 'Cherries', 'Plum', 'Clementine', 'Grapefruit', 'Honeydew', 'Blackberries'],
  juice:    ['Orange juice', 'Apple juice', 'Orange', 'Apple'],
  beer:     ['Beer', 'Light beer'],
  wine:     ['Red wine', 'White wine'],
};
/** Never offered as the "better" option, whatever the numbers say: processed or indulgent foods. */
const NEVER_OFFER = new Set(['Bacon, cooked', 'Ham, sliced', 'Hot dog', 'Pepperoni pizza slice', 'Glazed donut', 'French fries',
  'Macaroni and cheese', 'Milk chocolate', 'Chocolate chip cookie', 'Chicken nuggets', 'Fried rice', 'Potato chips']);
const _famOfName = new Map();
for (const [id, names] of Object.entries(FAMILIES)) for (const n of names) {
  const k = n.toLowerCase();
  _famOfName.set(k, [...(_famOfName.get(k) || []), id]);
}

const _famCache = new Map();
/** Swap families the closest built-in match belongs to ([] when nothing matches well). */
export function familiesOf(name) {
  const key = String(name || '').toLowerCase();
  if (_famCache.has(key)) return _famCache.get(key);
  const [best] = searchCommonFoodsScored(name, 1);
  const fams = best && best.score >= 65 ? (_famOfName.get(best.entry.name.toLowerCase()) || []) : [];
  _famCache.set(key, fams);
  return fams;
}

const per = (food) => itemTotals({ nutrition: food?.nutrition, quantity: 1 });

// Smallest absolute drop worth mentioning, and how much another limit nutrient may rise before it is "worse".
const MIN_DROP = { sodium: 100, fat: 3, 'saturated-fat': 1, sugars: 4 };
const WORSE_SLACK = { sodium: 60, fat: 2, 'saturated-fat': 0.8, sugars: 3 };

/** Is `cand` better than `cur` (both totals) for this focus? Returns a 0+ score, or 0 when not better. */
function improvement(focus, cur, cand) {
  const dk = cur.calories > 0 ? (cur.calories - cand.calories) / cur.calories : 0;     // + = fewer calories
  const curDensity = cur.calories > 0 ? cur.proteins / cur.calories : 0;
  const candDensity = cand.calories > 0 ? cand.proteins / cand.calories : 0;
  if (REDUCE_FOCUS.has(focus)) {
    // A real drop in the nutrient (not a rounding difference), without trading it for far more
    // calories, losing the protein, or making another "limit" nutrient clearly worse.
    const c = cur[focus], d = cand[focus];
    if (!(c > 0) || (c - d) / c < 0.3 || c - d < MIN_DROP[focus]) return 0;
    if (cand.calories > cur.calories * 1.25 || cand.proteins < cur.proteins * 0.6) return 0;
    for (const k of REDUCE_FOCUS) {
      if (k === focus) continue;
      if (cand[k] > cur[k] * 1.25 + WORSE_SLACK[k]) return 0;
    }
    return (c - d) / c + Math.max(dk, 0) * 0.2;
  }
  switch (focus) {
    case 'fiber':
      if (cand.fiber < cur.fiber * 1.3 || cand.fiber - cur.fiber < 2) return 0;
      if (cand.calories > cur.calories * 1.4) return 0;
      return (cand.fiber - cur.fiber) / Math.max(cur.fiber, 2) * 0.3 + Math.max(dk, 0) * 0.2;
    case 'lose':
      if (dk < 0.15 || cand.proteins < cur.proteins * 0.6) return 0;
      return dk + Math.max(0, (cand.proteins - cur.proteins) / Math.max(cur.proteins, 10)) * 0.3;
    case 'gain':
      if (cand.calories < cur.calories * 1.15 || cand.proteins < cur.proteins) return 0;
      return (cand.calories - cur.calories) / Math.max(cur.calories, 50) * 0.5 + (cand.proteins - cur.proteins) / Math.max(cur.proteins, 10) * 0.5;
    case 'protein':
      if (candDensity < curDensity * 1.25 || cand.proteins < cur.proteins * 0.8 || cand.proteins < 5) return 0;
      return candDensity - curDensity + (cand.proteins - cur.proteins) / 100;
    default: {
      const ds = cur.sugars > 0 ? (cur.sugars - cand.sugars) / cur.sugars : 0;
      if (ds < 0.3 && dk < 0.2) return 0;
      return Math.max(ds, 0) + Math.max(dk, 0) * 0.5;
    }
  }
}

function why(focus, d) {
  const bits = [];
  if (d.kcal < -10) bits.push(`${-d.kcal} fewer kcal`); else if (d.kcal > 10) bits.push(`${d.kcal} more kcal`);
  if (d.protein > 2) bits.push(`${d.protein} g more protein`); else if (d.protein < -2 && focus !== 'lose') bits.push(`${-d.protein} g less protein`);
  if (d.sugar < -3) bits.push(`${-d.sugar} g less sugar`);
  if (focus === 'sodium' && d.sodium < -40) bits.push(`${-d.sodium} mg less sodium`);
  if (focus === 'fat' && d.fat < -1) bits.push(`${-d.fat} g less fat`);
  if (focus === 'saturated-fat' && d.satfat < -0.5) bits.push(`${Math.round(-d.satfat * 10) / 10} g less saturated fat`);
  if (focus === 'fiber' && d.fiber > 1) bits.push(`${d.fiber} g more fiber`);
  return bits.join(', ') || 'similar';
}

/**
 * @param {object} item        the diary item
 * @param {object} p
 * @param {'lose'|'gain'|'protein'|'balanced'} p.focus
 * @param {Array}  p.saved     the user's saved foods
 * @param {string[]} p.muted   never-suggest names (never offered as a replacement)
 * @returns {{kind:'swap'|'family'|'none', options:Array, category:string|null}}
 */
export function findBetterOptions(item, { focus = 'balanced', saved = [], muted = [], limit = 4 } = {}) {
  if (!item || item.type === 'quick_calories') return { kind: 'none', options: [], category: null };
  const q = num(item.quantity) || 1;
  const cur = itemTotals(item);

  // Sugary drinks: the zero-sugar twin, however small the saving (the user asked).
  const swaps = ['lose', 'balanced', 'sugars'].includes(focus)
    ? findSwaps([{ ...item }], saved, { level: 'thorough', ignoreMuted: true }) : [];
  if (swaps.length) {
    const sw = swaps[0];
    return {
      kind: 'swap', category: 'Beverages',
      options: [{ food: sw.to, delta: { kcal: -sw.savesKcal, protein: 0, sugar: -sw.savesSugar }, why: `${sw.savesKcal} fewer kcal, ${sw.savesSugar} g less sugar`, source: sw.source }],
    };
  }

  const fams = familiesOf(item.name);
  if (!fams.length) return { kind: 'none', options: [], category: null };

  const itemName = String(item.name || '').toLowerCase();
  const pool = [];
  for (const e of COMMON_FOODS) if (fams.some(f => FAMILIES[f].includes(e.name)) && !NEVER_OFFER.has(e.name)) pool.push({ food: commonFoodToFood(e), source: 'usda' });
  for (const f of saved || []) if (f && !f.deleted_at && familiesOf(f.name).some(x => fams.includes(x))) pool.push({ food: f, source: 'saved' });

  const out = [];
  const seen = new Set();
  for (const c of pool) {
    const name = String(c.food.name || '').toLowerCase();
    if (!name || name === itemName || seen.has(name) || isMuted(c.food.name, muted)) continue;
    const one = per(c.food);
    if (one.calories <= 0) continue;
    // A serving a fraction of the size is not a like-for-like swap (a lime for a banana).
    if (cur.calories > 0 && one.calories * q < cur.calories * 0.25) continue;
    const cand = Object.fromEntries(Object.entries(one).map(([k, v]) => [k, v * q]));
    const score = improvement(focus, cur, cand);
    if (score <= 0) continue;
    seen.add(name);
    const delta = {
      kcal: r0(cand.calories - cur.calories), protein: r0(cand.proteins - cur.proteins), sugar: r0(cand.sugars - cur.sugars),
      sodium: r0(cand.sodium - cur.sodium), fat: r0(cand.fat - cur.fat), satfat: cand['saturated-fat'] - cur['saturated-fat'], fiber: r0(cand.fiber - cur.fiber),
    };
    out.push({ food: { ...c.food, quantity: q }, delta, why: why(focus, delta), source: c.source, score: score + (c.source === 'saved' ? 0.15 : 0) });
  }
  out.sort((a, b) => b.score - a.score);
  return { kind: out.length ? 'family' : 'none', options: out.slice(0, limit), category: fams[0] };
}
