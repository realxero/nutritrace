/** Proactive suggestions: swaps, protein gap, day-state gating (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  itemTotals, dayTotals, dayState, drinkKind, findSwaps, findSavedTwin,
  findProteinIdeas, suggestForDay, mealForSuggestion,
} from '../src/lib/suggestions.js';

const cola = { name: 'Coca-Cola', brand: 'Coca-Cola', quantity: 1, meal: 1, uuid: 'u1', portion: 12, unit: 'fl oz',
  nutrition: { calories: 140, sugars: 39, proteins: 0 } };
const food = (name, p, k, extra = {}) => ({ name, nutrition: { proteins: p, calories: k }, portion: 1, unit: 'serving', ...extra });

test('day state', () => {
  assert.equal(dayState('2026-10-20', '2026-10-22'), 'past');
  assert.equal(dayState('2026-10-22', '2026-10-22'), 'today');
  assert.equal(dayState('2026-10-25', '2026-10-22'), 'future');
});

test('totals scale by quantity', () => {
  assert.equal(itemTotals({ quantity: 2, nutrition: { calories: 100, proteins: 5, sugars: 3 } }).calories, 200);
  assert.equal(dayTotals([cola, { ...cola, quantity: 2 }]).sugars, 39 * 3);
});

test('detects full-sugar drinks and ignores light ones', () => {
  assert.equal(drinkKind(cola), 'soda');
  assert.equal(drinkKind({ name: 'Red Bull' }), 'energy');
  assert.equal(drinkKind({ name: 'Sweet tea' }), 'tea');
  assert.equal(drinkKind({ name: 'Coke Zero' }), null);
  assert.equal(drinkKind({ name: 'Diet Pepsi' }), null);
  assert.equal(drinkKind({ name: 'Sparkling water' }), null);
  assert.equal(drinkKind({ name: 'Cola, unsweetened' }), null);
});

test('a generic zero-sugar swap shows what it saves', () => {
  const [s] = findSwaps([cola]);
  assert.equal(s.kind, 'swap');
  assert.equal(s.source, 'generic');
  assert.equal(s.to.name, 'Zero-sugar soda');
  assert.equal(s.savesKcal, 140);
  assert.equal(s.savesSugar, 39);
  assert.equal(s.itemIndex, 0);
});

test('quantity is carried to the swap', () => {
  const [s] = findSwaps([{ ...cola, quantity: 2 }]);
  assert.equal(s.to.quantity, 2);
  assert.equal(s.savesSugar, 78);
});

test("the user's own zero-sugar twin wins over the generic", () => {
  const saved = [{ id: 9, name: 'Coke Zero', brand: 'Coca-Cola', nutrition: { calories: 0, sugars: 0 } },
    { id: 10, name: 'Sprite Zero', nutrition: { calories: 0, sugars: 0 } }];
  const twin = findSavedTwin(cola, saved);
  assert.equal(twin.id, 9);
  const [s] = findSwaps([cola], saved);
  assert.equal(s.source, 'saved');
  assert.equal(s.to.name, 'Coke Zero');
});

test('little sugar, non-drinks and quick calories are left alone', () => {
  assert.equal(findSwaps([{ ...cola, nutrition: { calories: 5, sugars: 1 } }]).length, 0);
  assert.equal(findSwaps([{ name: 'Apple', nutrition: { calories: 95, sugars: 19 } }]).length, 0);
  assert.equal(findSwaps([{ ...cola, type: 'quick_calories' }]).length, 0);
});

test('a sweet drink with no sugar figure is judged by calories', () => {
  assert.equal(findSwaps([{ name: 'Mountain Dew', nutrition: { calories: 170 } }]).length, 1);
  assert.equal(findSwaps([{ name: 'Mountain Dew', nutrition: { calories: 20 } }]).length, 0);
});

const common = [
  food('Chicken breast, cooked', 26, 140), food('Greek yogurt, plain nonfat', 17, 100),
  food('Egg whites', 11, 52), food('Egg, large', 6, 72), food('Almonds', 6, 164),
  food('Tuna, canned in water', 32, 142), food('Cookie dough protein bar', 20, 200),
];

test('protein gap suggests lean foods, one per kind, none that are not a fit', () => {
  const r = findProteinIdeas({ items: [food('Toast', 3, 80)], proteinGoal: 120, calorieGoal: 2000, common });
  assert.equal(r.gap, 117);
  assert.equal(r.ideas.length, 3);
  const names = r.ideas.map(i => i.food.name);
  assert.ok(!names.includes('Almonds'));            // too little protein per calorie
  assert.ok(!names.includes('Egg, large'));         // 6 g is under the floor
  assert.equal(new Set(names.map(n => n.split(/[ ,]/)[0])).size, 3);
});

test('no gap, no goal, or a small gap says nothing', () => {
  assert.equal(findProteinIdeas({ items: [], proteinGoal: null, common }).ideas.length, 0);
  assert.equal(findProteinIdeas({ items: [food('x', 110, 500)], proteinGoal: 120, common }).ideas.length, 0);
  assert.equal(findProteinIdeas({ items: [food('x', 110, 500)], proteinGoal: 120, common }).gap, 10);
});

test('calories left cap what is suggested, and a tight day is flagged', () => {
  const r = findProteinIdeas({ items: [food('Dinner', 20, 1900)], proteinGoal: 120, calorieGoal: 2000, common });
  assert.equal(r.tight, true);
  assert.ok(r.ideas.every(i => i.kcal <= 150));
  assert.ok(r.ideas.length > 0);
});

test('foods the user already logs rank first', () => {
  const saved = [food('Skyr', 15, 110, { id: 5, usage_count: 8 })];
  const r = findProteinIdeas({ items: [food('Toast', 3, 80)], proteinGoal: 120, calorieGoal: 2000, saved, common });
  assert.equal(r.ideas[0].food.name, 'Skyr');
});

test('foods already eaten today are not suggested again', () => {
  const r = findProteinIdeas({ items: [food('Egg whites', 11, 52)], proteinGoal: 120, calorieGoal: 2000, common });
  assert.ok(!r.ideas.some(i => i.food.name === 'Egg whites'));
});

const base = { date: '2026-10-22', today: '2026-10-22', proteinGoal: 120, calorieGoal: 2000, common };

test('today: swaps and protein both appear', () => {
  const s = suggestForDay({ ...base, items: [cola] });
  assert.equal(s.swaps.length, 1);
  assert.ok(s.protein && s.protein.ideas.length);
});

test('today with nothing logged says nothing', () => {
  const s = suggestForDay({ ...base, items: [] });
  assert.equal(s.swaps.length, 0);
  assert.equal(s.protein, null);
});

test('a future day still gets help, even when empty (planning)', () => {
  const s = suggestForDay({ ...base, date: '2026-10-25', items: [] });
  assert.equal(s.state, 'future');
  assert.equal(s.planning, true);
  assert.ok(s.protein && s.protein.ideas.length);
  const planned = suggestForDay({ ...base, date: '2026-10-25', items: [cola] });
  assert.equal(planned.swaps.length, 1);
  assert.equal(planned.planning, false);
});

test('past days and completed days get nothing', () => {
  assert.deepEqual(suggestForDay({ ...base, date: '2026-10-20', items: [cola] }).swaps, []);
  assert.equal(suggestForDay({ ...base, items: [cola], completed: true }).protein, null);
});

test('toggles and dismissals are respected', () => {
  const off = suggestForDay({ ...base, items: [cola], enabled: { swaps: false, protein: false } });
  assert.equal(off.swaps.length, 0);
  assert.equal(off.protein, null);
  const first = suggestForDay({ ...base, items: [cola] });
  const gone = suggestForDay({ ...base, items: [cola], dismissed: [first.swaps[0].id, first.protein.id] });
  assert.equal(gone.swaps.length, 0);
  assert.equal(gone.protein, null);
});

test('meal choice: time of day for today, emptiest lunch/dinner for other days', () => {
  assert.equal(mealForSuggestion({ state: 'today', timeMeal: 2 }), 2);
  assert.equal(mealForSuggestion({ state: 'today', timeMeal: 3, mealCount: 2 }), 1);
  const items = [{ meal: 1 }, { meal: 1 }, { meal: 0 }];
  assert.equal(mealForSuggestion({ state: 'future', items }), 2);
  assert.equal(mealForSuggestion({ state: 'future', items: [] }), 1);
});

import { LEVELS, levelOf, isMuted, mutedKey } from '../src/lib/suggestions.js';
import { goalFocus, familiesOf, findBetterOptions } from '../src/lib/better-options.js';

test('levels: gentle is quieter, thorough notices more', () => {
  const small = { name: 'Gatorade', quantity: 1, nutrition: { calories: 80, sugars: 21 } };      // 21 g sugar
  assert.equal(findSwaps([small], [], { level: 'gentle' }).length, 0);
  assert.equal(findSwaps([small], [], { level: 'balanced' }).length, 1);
  const tiny = { name: 'Sprite', quantity: 1, nutrition: { calories: 40, sugars: 8 } };
  assert.equal(findSwaps([tiny], [], { level: 'balanced' }).length, 0);
  assert.equal(findSwaps([tiny], [], { level: 'thorough' }).length, 1);
  assert.equal(levelOf('nonsense'), LEVELS.balanced);
});

test('levels: protein gap size, idea count and gentle waiting until afternoon', () => {
  const items = [food('Toast', 3, 80)];
  const args = { ...base, items, common };
  // 117 g gap: all levels speak up on a future day, gentle holds back this morning
  assert.equal(suggestForDay({ ...args, level: 'gentle', hour: 9 }).protein, null);
  assert.equal(suggestForDay({ ...args, level: 'gentle', hour: 16 }).protein.ideas.length, 2);
  assert.equal(suggestForDay({ ...args, level: 'balanced', hour: 9 }).protein.ideas.length, 3);
  assert.equal(suggestForDay({ ...args, level: 'thorough', hour: 9 }).protein.ideas.length, 4);
  assert.ok(suggestForDay({ ...args, date: '2026-10-25', level: 'gentle', hour: 9 }).protein);   // planning ahead
  // a 20 g gap is under gentle's bar but over balanced's
  const near = [food('Dinner', 100, 900)];
  assert.equal(suggestForDay({ ...args, items: near, level: 'gentle', hour: 18 }).protein, null);
  assert.ok(suggestForDay({ ...args, items: near, level: 'balanced', hour: 18 }).protein);
});

test('never-suggest list: matches either way round and skips swaps and ideas', () => {
  assert.equal(mutedKey('  Coca-Cola!! '), 'coca cola');
  assert.equal(isMuted('Coca-Cola Classic', ['coca cola']), true);
  assert.equal(isMuted('Coke', ['Coca-Cola']), false);
  assert.equal(isMuted('Almonds', ['ab']), false);               // too short to match anything
  assert.equal(findSwaps([cola], [], { muted: ['Coca-Cola'] }).length, 0);
  const r = findProteinIdeas({ items: [food('Toast', 3, 80)], proteinGoal: 120, calorieGoal: 2000, common, muted: ['chicken breast'] });
  assert.ok(!r.ideas.some(i => /chicken/i.test(i.food.name)));
});

test('goal focus', () => {
  assert.equal(goalFocus({ targetKg: 80, currentKg: 90 }), 'lose');
  assert.equal(goalFocus({ targetKg: 75, currentKg: 70 }), 'gain');
  assert.equal(goalFocus({ targetKg: 80, currentKg: 80.2, proteinGap: 40 }), 'protein');
  assert.equal(goalFocus({}), 'balanced');
});

test('better option: a sugary drink always gets its zero-sugar twin when asked', () => {
  const r = findBetterOptions({ name: 'Sprite', quantity: 1, nutrition: { calories: 40, sugars: 8 } }, { focus: 'lose' });
  assert.equal(r.kind, 'swap');
  assert.equal(r.options[0].food.name, 'Zero-sugar soda');
});

test('better option: finds lighter foods in the same category for losing weight', () => {
  assert.deepEqual(familiesOf('Cheddar cheese'), ['cheeses']);
  const r = findBetterOptions({ name: 'Cheddar cheese', quantity: 1, nutrition: { calories: 113, proteins: 7, sugars: 0.1 } }, { focus: 'lose', limit: 5 });
  assert.equal(r.kind, 'family');
  assert.ok(r.options.length > 0);
  for (const o of r.options) assert.ok(o.delta.kcal < 0, `${o.food.name} should cut calories`);
  // only cheeses, never milk or yogurt
  const cheeses = ['Cheddar cheese', 'American cheese slice', 'Cream cheese', 'Mozzarella, part-skim', 'Cottage cheese, 2%', 'Parmesan, grated'];
  for (const o of r.options) assert.ok(cheeses.includes(o.food.name), `${o.food.name} is not a cheese`);
});

test('better option: never offers a muted food or the same food, and says nothing for unknown foods', () => {
  const r = findBetterOptions({ name: 'Cheddar cheese', quantity: 1, nutrition: { calories: 113, proteins: 7 } }, { focus: 'lose', muted: ['cottage'], limit: 10 });
  assert.ok(!r.options.some(o => /cottage/i.test(o.food.name)));
  assert.ok(!r.options.some(o => /^cheddar cheese$/i.test(o.food.name)));
  const none = findBetterOptions({ name: 'Grandma Zorp special', quantity: 1, nutrition: { calories: 300 } }, { focus: 'lose' });
  assert.equal(none.kind, 'none');
  assert.equal(findBetterOptions({ type: 'quick_calories', name: 'x' }).kind, 'none');
});

test('better option: scales to the logged quantity', () => {
  const one = findBetterOptions({ name: 'Cheddar cheese', quantity: 1, nutrition: { calories: 113, proteins: 7 } }, { focus: 'lose', limit: 10 });
  const two = findBetterOptions({ name: 'Cheddar cheese', quantity: 2, nutrition: { calories: 113, proteins: 7 } }, { focus: 'lose', limit: 10 });
  if (one.options.length && two.options.length) assert.equal(two.options[0].food.quantity, 2);
});
