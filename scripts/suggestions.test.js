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
