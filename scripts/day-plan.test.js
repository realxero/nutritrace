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

import { classifyRole, dishFromMeal, userPools, planWeek } from '../src/lib/day-plan.js';

const nut = (cal, p, c, f, extra = {}) => ({ calories: cal, proteins: p, carbohydrates: c, fat: f, ...extra });

test('classifying the user\'s own foods: built-in matches keep their roles, others go by name and macros', () => {
  assert.ok(classifyRole({ name: 'Banana', nutrition: nut(105, 1, 27, 0) }).includes('fruit'));
  assert.ok(classifyRole({ name: 'Chicken breast, cooked', nutrition: nut(140, 26, 0, 3) }).includes('protein'));
  // branded, not in the library
  assert.ok(classifyRole({ name: 'Fage Total 0% Greek Yogurt', nutrition: nut(90, 18, 5, 0) }).includes('breakfast-protein'));
  assert.ok(classifyRole({ name: 'Quest Protein Bar', nutrition: nut(190, 20, 21, 8) }).includes('snack-protein'));
  assert.ok(classifyRole({ name: 'Basmati rice pouch', nutrition: nut(210, 5, 46, 1) }).includes('starch'));
  assert.ok(classifyRole({ name: 'Chicken burrito bowl', nutrition: nut(620, 38, 62, 22) }).includes('dish'));
  // not planning foods
  assert.deepEqual(classifyRole({ name: 'Coca-Cola', nutrition: nut(140, 0, 39, 0) }), []);
  assert.deepEqual(classifyRole({ name: 'Ranch dressing', nutrition: nut(130, 0, 2, 14) }), []);
  assert.deepEqual(classifyRole({ name: 'Mystery', nutrition: {} }), []);
});

test('saved meals and recipes become dishes; ones without usable nutrition are skipped', () => {
  const recipe = dishFromMeal({ id: 5, name: 'Turkey chili', nutrition: nut(420, 38, 36, 12), servings: 4 }, true);
  assert.equal(recipe.kind, 'recipe');
  assert.equal(recipe.unit, 'serving');
  const meal = dishFromMeal({ id: 6, name: 'Usual lunch', nutrition: nut(650, 45, 60, 20), items: [{ name: 'Rice', quantity: 1, nutrition: nut(200, 4, 44, 0) }] });
  assert.equal(meal.kind, 'meal');
  assert.equal(meal._mealItems.length, 1);
  assert.equal(dishFromMeal({ name: 'Empty', nutrition: {} }), null);
  assert.equal(dishFromMeal({ name: 'Tiny', nutrition: nut(40, 1, 5, 1) }), null);
  assert.equal(dishFromMeal(null), null);
});

test('brands and saved foods can be planned, and library copies saved earlier are not duplicated', () => {
  const saved = [
    { id: 1, name: 'Fage Total 0% Greek Yogurt', brand: 'Fage', nutrition: nut(90, 18, 5, 0), usage_count: 20 },
    { id: 2, name: 'Banana', brand: 'USDA', nutrition: nut(105, 1, 27, 0), usage_count: 30 },
  ];
  const pools = userPools({ saved });
  assert.ok(pools.get('breakfast-protein').some(e => e.name.startsWith('Fage')));
  assert.ok(![...pools.values()].flat().some(e => e.name === 'Banana'), 'USDA copies stay with the built-in list');
  const picks = new Set();
  for (let seed = 0; seed < 6; seed++) planDay({ ...base, saved, seed }).meals.forEach(m => m.items.forEach(i => picks.add(i.food.name)));
  assert.ok(picks.has('Fage Total 0% Greek Yogurt'), 'a food they log a lot is planned');
});

test('a saved recipe or meal can stand in for lunch or dinner, scaled to the calories, and meals expand to ingredients', () => {
  const dishes = [
    dishFromMeal({ id: 5, name: 'Turkey chili', nutrition: nut(420, 38, 36, 12) }, true),
    dishFromMeal({ id: 6, name: 'Usual lunch', nutrition: nut(650, 45, 60, 20), items: [
      { id: 11, name: 'Chicken breast, cooked', quantity: 1.5, portion: 3, unit: 'oz', nutrition: nut(140, 26, 0, 3) },
      { id: 12, name: 'Brown rice, cooked', quantity: 1, portion: 1, unit: 'cup', nutrition: nut(215, 5, 45, 2) },
    ] }),
  ];
  let found = null;
  for (let seed = 0; seed < 6 && !found; seed++) {
    const p = planDay({ ...base, dishes, seed });
    found = p.meals.flatMap(m => m.items).find(i => i.role === 'dish');
    if (found) {
      assert.ok(found.quantity >= 0.5 && found.quantity <= 2);
      assert.ok(found.yours);
      assert.ok(p.totals.calories >= 2000 * 0.85 && p.totals.calories <= 2000 * 1.12, `calories ${p.totals.calories}`);
      const rows = planToDiaryRows(p);
      if (found.food.kind === 'meal') assert.ok(rows.some(r => r.fromMeal === found.food.name && r.food.name === 'Brown rice, cooked'));
      else assert.ok(rows.some(r => r.food.name === 'Turkey chili'));
    }
  }
  assert.ok(found, 'a dish is used on some shuffle');
});

test('user foods and dishes also obey allergies, diet and dislikes', () => {
  const saved = [{ id: 1, name: 'Chobani Greek Yogurt', brand: 'Chobani', nutrition: nut(100, 17, 6, 0), usage_count: 50 }];
  const dishes = [dishFromMeal({ id: 5, name: 'Beef chili', nutrition: nut(450, 35, 38, 16) }, true)];
  const prefs = { allergens: ['milk'], diet: 'vegetarian', avoid: [], dislikes: [] };
  for (let seed = 0; seed < 4; seed++) {
    const p = planDay({ ...base, saved, dishes, prefs, seed });
    for (const m of p.meals) for (const i of m.items) for (const f of [i.food, ...i.alts.map(a => a.food)])
      assert.equal(checkFood(f, prefs).ok, true, `${f.name} breaks a preference`);
  }
});

test('a week: seven different plans that do not repeat the day before', () => {
  const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${23 + i}`, meals, remaining: { calories: 2000, protein: 140 } }));
  const w = planWeek({ days, prefs: null, seed: 0 });
  assert.equal(w.length, 7);
  const sig = (p) => p.meals.flatMap(m => m.items.map(i => i.food.name)).sort().join('|');
  assert.equal(new Set(w.map(d => sig(d.plan))).size, 7);
  for (let i = 1; i < w.length; i++) {
    const prev = new Set(w[i - 1].plan.meals.flatMap(m => m.items.map(it => it.food.name)));
    const mains = w[i].plan.meals.flatMap(m => m.items).filter(it => it.role === 'protein').map(it => it.food.name);
    assert.ok(mains.every(n => !prev.has(n)), `day ${i} repeats yesterday's main`);
  }
  assert.deepEqual(planWeek({ days, seed: 1 }).map(d => d.date), days.map(d => d.date));
});

import { summarizeNutrients } from '../src/lib/weekly-checkin.js';

test('weekly sodium and fiber: averages over logged days, counts days over / under, needs enough days', () => {
  const day = (sodium, fiber, logged = true) => ({ sodium, fiber, logged });
  const w = summarizeNutrients({ days: [day(2500, 12), day(2000, 30), day(3000, 10), day(2300, 28), day(0, 0, false), day(2700, 20), day(2100, 25)], sodiumLimit: 2300, fiberTarget: 28 });
  assert.equal(w.loggedDays, 6);
  assert.equal(w.sodiumAvg, 2433);
  assert.equal(w.sodiumDaysOver, 3);          // 2500, 3000, 2700 (2300 is not over)
  assert.equal(w.fiberAvg, 21);
  assert.equal(w.fiberDaysUnder, 4);          // 12, 10, 20, 25 (28 is not under)
  const few = summarizeNutrients({ days: [day(2500, 12), day(2000, 30)] });
  assert.equal(few.sodiumAvg, null);
  assert.equal(few.loggedDays, 2);
  assert.equal(summarizeNutrients({}).sodiumAvg, null);
});
