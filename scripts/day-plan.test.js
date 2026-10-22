/** Plan my whole day (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMON_FOODS } from '../src/lib/common-foods.js';
import { planDay, ROLES, mealKind, swapPlanItem, removePlanItem, planToDiaryRows, planTotals } from '../src/lib/day-plan.js';
import { checkFood } from '../src/lib/food-safety.js';

const meals = [{ idx: 0, name: 'Breakfast' }, { idx: 1, name: 'Lunch' }, { idx: 2, name: 'Dinner' }, { idx: 3, name: 'Snacks' }];
const base = { meals, remaining: { calories: 2000, protein: 140 }, limits: {}, prefs: null, saved: [], muted: [], seed: 0 };

test('every food named in a role exists in the built-in library', () => {
  const names = new Set(COMMON_FOODS.map(e => e.name));
  for (const [role, list] of Object.entries(ROLES)) for (const n of list) assert.ok(names.has(n), `${role}: ${n}`);
});

test('meal kinds come from the name, else the position', () => {
  assert.equal(mealKind('Breakfast', 0), 'breakfast');
  assert.equal(mealKind('Brunch', 5), 'breakfast');
  assert.equal(mealKind('Supper', 0), 'dinner');
  assert.equal(mealKind('Pre-workout', 0), 'breakfast');
  assert.equal(mealKind('Pre-workout', 3), 'snack');
  assert.equal(mealKind('Late Snack', 1), 'snack');
});

test('a plan lands near the calorie target, fills every meal, and has alternatives', () => {
  const p = planDay(base);
  assert.equal(p.meals.length, 4);
  assert.ok(p.totals.calories >= 2000 * 0.88 && p.totals.calories <= 2000 * 1.1, `calories ${p.totals.calories}`);
  for (const m of p.meals) {
    assert.ok(m.items.length >= 2, m.name);
    for (const i of m.items) { assert.ok(i.quantity >= 0.5 && i.quantity <= 4); assert.ok(i.alts.length > 0, `${i.food.name} has alternatives`); }
  }
  assert.ok(p.totals.proteins >= 140 * 0.85, `protein ${p.totals.proteins}`);
});

test('the same seed gives the same plan; a new seed gives a different one', () => {
  const names = (p) => p.meals.flatMap(m => m.items.map(i => i.food.name)).join('|');
  assert.equal(names(planDay(base)), names(planDay(base)));
  assert.notEqual(names(planDay(base)), names(planDay({ ...base, seed: 1 })));
});

test('no food repeats within a day', () => {
  const all = planDay(base).meals.flatMap(m => m.items.map(i => i.food.name));
  assert.equal(new Set(all).size, all.length);
});

test('allergies, diet, dislikes and never-suggest foods are respected, in the picks AND the alternatives', () => {
  const prefs = { allergens: ['milk', 'egg', 'peanut', 'tree-nut', 'wheat'], avoid: ['mushroom'], diet: 'vegetarian', dislikes: ['tofu'] };
  const p = planDay({ ...base, prefs, muted: ['kale'] });
  assert.ok(p.meals.length > 0);
  for (const m of p.meals) for (const i of m.items) {
    for (const f of [i.food, ...i.alts.map(a => a.food)]) {
      assert.equal(checkFood(f, prefs).ok, true, `${f.name} breaks a preference`);
      assert.ok(!/kale/i.test(f.name), 'muted food offered');
    }
  }
});

test('with a vegan diet no animal product appears anywhere', () => {
  const p = planDay({ ...base, prefs: { diet: 'vegan' } });
  for (const m of p.meals) for (const i of m.items) for (const f of [i.food, ...i.alts.map(a => a.food)])
    assert.equal(checkFood(f, { diet: 'vegan' }).ok, true, f.name);
});

test('a slot nothing fits is reported, not filled with something unsafe', () => {
  // everything in breakfast-protein excluded by these preferences
  const prefs = { allergens: ['milk', 'egg', 'soy'], diet: 'vegan' };
  const p = planDay({ ...base, prefs });
  assert.ok(p.notes.some(n => /No breakfast protein option fits your preferences for Breakfast/.test(n)));
  for (const m of p.meals) for (const i of m.items) assert.equal(checkFood(i.food, prefs).ok, true);
});

test('meals that already have food are left alone; the rest share what is left', () => {
  const p = planDay({ ...base, meals: meals.map(m => ({ ...m, hasItems: m.idx === 0 })), remaining: { calories: 1400, protein: 100 } });
  assert.deepEqual(p.meals.map(m => m.idx), [1, 2, 3]);
  assert.ok(p.totals.calories >= 1400 * 0.85 && p.totals.calories <= 1400 * 1.1);
  const full = planDay({ ...base, meals: meals.map(m => ({ ...m, hasItems: true })) });
  assert.equal(full.allFilled, true);
  assert.equal(full.meals.length, 0);
});

test('no calorie goal asks for one; nothing left means nothing to plan', () => {
  assert.equal(planDay({ ...base, remaining: {} }).needsGoal, true);
  const done = planDay({ ...base, remaining: { calories: -50, protein: 0 } });
  assert.equal(done.needsGoal, false);
  assert.equal(done.full, true);
});

test('without a protein goal it uses a typical share of calories and says so', () => {
  const p = planDay({ ...base, remaining: { calories: 2000 } });
  assert.equal(p.targets.proteinDefault, true);
  assert.equal(p.targets.protein, 125);
});

test('swapping an item uses its alternative at similar calories, and the old food becomes an alternative', () => {
  const p = planDay(base);
  const before = p.meals[1].items[0];
  const alt = before.alts[0];
  const q = swapPlanItem(p, 1, 0, 0);
  const after = q.meals[1].items[0];
  assert.equal(after.food.name, alt.food.name);
  assert.ok(Math.abs(after.kcal - before.kcal) <= before.kcal * 0.45 + 40);
  assert.ok(after.alts.some(a => a.food.name === before.food.name));
  assert.equal(p.meals[1].items[0].food.name, before.food.name, 'the original plan is not mutated');
  assert.equal(q.totals.calories, planTotals(q).calories);
  assert.equal(swapPlanItem(p, 9, 9, 9), p);
});

test('removing an item (and an emptied meal) updates the totals', () => {
  const p = planDay(base);
  const q = removePlanItem(p, 0, 0);
  assert.ok(q.totals.calories < p.totals.calories);
  let r = p;
  for (let i = 0; i < 3; i++) r = removePlanItem(r, 3, 0);
  assert.ok(r.meals.every(m => m.items.length > 0));
});

test('diary rows: one per item, with its meal, and a single meal can be picked', () => {
  const p = planDay(base);
  const rows = planToDiaryRows(p);
  assert.equal(rows.length, p.meals.reduce((a, m) => a + m.items.length, 0));
  assert.ok(rows.every(r => r.food.name && r.quantity > 0 && [0, 1, 2, 3].includes(r.meal)));
  assert.ok(planToDiaryRows(p, { onlyMeal: 2 }).every(r => r.meal === 2));
});

test('limits are flagged honestly in the notes', () => {
  const p = planDay({ ...base, limits: { sodium: 500 } });
  assert.ok(p.notes.some(n => /Sodium comes to .* over your goal/.test(n)));
});
