/** Nutrient watch (sodium, fat, saturated fat, sugar) and fiber ideas (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMON_FOODS, commonFoodToFood } from '../src/lib/common-foods.js';
import { limitFor, findNutrientSwaps, buildDaySuggestions, WATCH, DEFAULT_WATCHED } from '../src/lib/day-suggestions.js';
import { findBetterOptions } from '../src/lib/better-options.js';

const lib = (n, quantity = 1, extra = {}) => ({ ...commonFoodToFood(COMMON_FOODS.find(e => e.name === n)), quantity, ...extra });
const common = COMMON_FOODS.map(e => commonFoodToFood(e));
const base = { date: '2026-10-22', today: '2026-10-22', calorieGoal: 2200, common, hour: 19 };

test('limits: the user goal wins, else a standard value, else not watched', () => {
  assert.deepEqual(limitFor('sodium', { sodium: 1500 }), { value: 1500, source: 'goal' });
  assert.deepEqual(limitFor('sodium', {}), { value: 2300, source: 'standard' });
  assert.equal(limitFor('fat', {}), null);                       // no standard figure, so only with a goal
  assert.deepEqual(limitFor('fat', { fat: 70 }), { value: 70, source: 'goal' });
});

test('sodium: a day over its limit points at the biggest contributor and a lighter swap', () => {
  const items = [lib('Cheese pizza slice', 4, { uuid: 'p' }), lib('Egg, large', 2, { uuid: 'e' })];   // ~2,560 mg
  const rows = findNutrientSwaps({ items, limits: {}, watched: ['sodium'], level: 'balanced' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nutrient, 'sodium');
  assert.equal(rows[0].from.uuid, 'p');
  assert.ok(rows[0].over);
  assert.ok(rows[0].delta.sodium < 0);
  assert.match(rows[0].why, /less sodium/);
  assert.ok(rows[0].ratio > 1);
});

test('nothing is said while the day is comfortably under its limit', () => {
  const items = [lib('Cheese pizza slice', 1), lib('Apple', 1)];
  assert.equal(findNutrientSwaps({ items, limits: {}, watched: ['sodium', 'saturated-fat'], level: 'balanced' }).length, 0);
});

test('levels: gentle waits until over the limit, thorough speaks up at 70%', () => {
  const items = [lib('Cheese pizza slice', 3, { uuid: 'p' })];     // ~1,920 mg = 83% of 2,300
  const at = (level) => findNutrientSwaps({ items, limits: {}, watched: ['sodium'], level }).length;
  assert.equal(at('gentle'), 0);
  assert.equal(at('balanced'), 0);                                  // 83% < 85%
  assert.equal(at('thorough'), 1);
});

test('fat is only watched with a goal; with one, a heavy dish gets a lighter option', () => {
  const items = [lib('Cheeseburger', 3, { uuid: 'c' })];
  assert.equal(findNutrientSwaps({ items, limits: {}, watched: ['fat'], level: 'balanced' }).length, 0);
  const rows = findNutrientSwaps({ items, limits: { fat: 40 }, watched: ['fat'], level: 'balanced' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].limitSource, 'goal');
  assert.match(rows[0].why, /less fat/);
});

test('a contributor with no good lighter option is skipped, not given a bad one', () => {
  const items = [lib('Ham, sliced', 12, { uuid: 'h' })];          // lots of sodium, but processed meat is never offered as the fix
  const rows = findNutrientSwaps({ items, limits: {}, watched: ['sodium'], level: 'thorough' });
  assert.equal(rows.length, 0);
});

test('muted foods are left alone', () => {
  const items = [lib('Cheese pizza slice', 4, { uuid: 'p' })];
  assert.equal(findNutrientSwaps({ items, limits: {}, watched: ['sodium'], level: 'balanced', muted: ['pizza'] }).length, 0);
});

test('fewer rows for gentle, and the worst nutrient first', () => {
  const items = [lib('Cheese pizza slice', 5, { uuid: 'p' }), lib('Ice cream, vanilla', 4, { uuid: 'i' })];
  const g = findNutrientSwaps({ items, limits: {}, watched: ['sodium', 'saturated-fat'], level: 'thorough' });
  assert.ok(g.length >= 1);
  for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].ratio >= g[i].ratio);
});

test('fiber: behind on fiber suggests fibrous foods that fit; planning a future day works too', () => {
  const items = [lib('White rice, cooked', 2), lib('Chicken breast, cooked', 1)];
  const s = buildDaySuggestions({ ...base, items, level: 'balanced' });
  assert.ok(s.fiber, 'fiber idea expected');
  assert.ok(s.fiber.gap >= 9);
  assert.ok(s.fiber.ideas.length > 0);
  for (const i of s.fiber.ideas) assert.ok(i.amount >= 4);
  const planned = buildDaySuggestions({ ...base, date: '2026-10-25', items: [], level: 'balanced' });
  assert.ok(planned.fiber);
});

test('switches: nutrients off, fiber un-watched, past day, completed day', () => {
  const items = [lib('Cheese pizza slice', 4, { uuid: 'p' })];
  assert.deepEqual(buildDaySuggestions({ ...base, items, nutrients: false }).nutrients, []);
  assert.equal(buildDaySuggestions({ ...base, items, watched: ['sodium'] }).fiber, null);
  assert.deepEqual(buildDaySuggestions({ ...base, date: '2026-10-20', items }).nutrients, []);
  assert.deepEqual(buildDaySuggestions({ ...base, items, completed: true }).nutrients, []);
});

test('hiding a suggestion for the day removes it', () => {
  const items = [lib('Cheese pizza slice', 4, { uuid: 'p' })];
  const first = buildDaySuggestions({ ...base, items });
  assert.ok(first.nutrients.length);
  const gone = buildDaySuggestions({ ...base, items, dismissed: [first.nutrients[0].id] });
  assert.equal(gone.nutrients.length, 0);
});

test('a sugary drink already handled as a swap is not repeated as a sugar-watch row', () => {
  const cola = { name: 'Coca-Cola', quantity: 4, uuid: 'c', portion: 12, unit: 'fl oz', meal: 1, nutrition: { calories: 140, sugars: 39, sodium: 45 } };
  const s = buildDaySuggestions({ ...base, items: [cola], limits: { sugars: 50 } });
  assert.equal(s.swaps.length, 1);
  assert.ok(!s.nutrients.some(n => n.itemIndex === 0));
});

test('on-demand better option works for every watched nutrient', () => {
  for (const n of Object.keys(WATCH)) assert.ok(typeof findBetterOptions(lib('Cheese pizza slice'), { focus: n }).kind === 'string');
  assert.ok(DEFAULT_WATCHED.includes('sodium'));
});
