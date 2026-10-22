/** Restaurant menu options through Trace: prompt, defensive parsing, helpers (fork). No network. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMenuPrompt, parseMenuItems, menuItemToFood, rememberRestaurant, menuQuestion } from '../src/lib/ai-restaurant.js';

const item = (over = {}) => ({
  name: 'Chicken Burrito Bowl', why: 'Lean protein, lots of fiber.', order: 'No rice, double chicken, salsa instead of sour cream',
  serving: { amount: 420, unit: 'g', label: '1 bowl' },
  nutrition: { calories: 520, proteins: 48, carbohydrates: 34, fat: 21, sugars: 6, fiber: 12, sodium: 1450, 'saturated-fat': 6 },
  source: 'web', confidence: 'high', ...over,
});

test('the prompt carries restaurant, goal, what is left, what they would have had, and the avoid list', () => {
  const p = buildMenuPrompt({ restaurant: 'Chipotle', focusLabel: 'losing weight', remaining: { calories: 700, protein: 55 },
    replacing: { name: 'Burrito', nutrition: { calories: 1000 } }, avoid: ['Queso'], country: 'US', mealName: 'Dinner' });
  assert.match(p, /Restaurant: Chipotle/);
  assert.match(p, /Goal: losing weight/);
  assert.match(p, /Meal: Dinner/);
  assert.match(p, /Calories left today: about 700 kcal/);
  assert.match(p, /Protein still to go today: about 55 g/);
  assert.match(p, /They were going to have: Burrito \(1000 kcal per serving\)/);
  assert.match(p, /Avoid \(never suggest\): Queso/);
});

test('parses items, brands them with the restaurant, and marks only looked-up items as from the menu', () => {
  const r = parseMenuItems(JSON.stringify({ restaurant: 'Chipotle', items: [item(), item({ name: 'Salad Bowl', source: 'estimate' })] }), { restaurant: 'Chipotle' });
  assert.equal(r.restaurant, 'Chipotle');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].fromMenu, true);
  assert.equal(r.items[1].fromMenu, false);
  assert.equal(r.items[0].estimate.brand, 'Chipotle');
  assert.equal(r.items[0].order, 'No rice, double chicken, salsa instead of sour cream');
});

test('tolerates fences and chatter', () => {
  const text = 'Here you go:\n```json\n' + JSON.stringify({ restaurant: 'Subway', items: [item({ name: 'Turkey 6-inch' })] }) + '\n```';
  assert.equal(parseMenuItems(text, { restaurant: 'Subway' }).items.length, 1);
});

test('drops impossible, avoided and duplicate items', () => {
  const reply = JSON.stringify({ items: [
    item({ nutrition: { calories: 0 } }),                                        // no calories
    item({ name: 'Magic Bowl', nutrition: { calories: 6000 }, serving: { amount: 20, unit: 'g' } }),   // impossible density
    item({ name: 'Queso Bowl' }),                                                // avoided
    item({ name: 'Veggie Bowl' }), item({ name: 'Veggie Bowl' }),                // duplicate
  ] });
  const r = parseMenuItems(reply, { avoid: ['queso'], restaurant: 'Chipotle' });
  assert.deepEqual(r.items.map(i => i.estimate.name), ['Veggie Bowl']);
});

test('an unknown restaurant or no usable items is a clear message, not an invented menu', () => {
  assert.throws(() => parseMenuItems('{"error":"I do not recognise that restaurant"}'), /do not recognise/);
  assert.throws(() => parseMenuItems(JSON.stringify({ items: [] })), /usable menu items/);
  assert.throws(() => parseMenuItems('sorry'), /didn't return/);
});

test('caps the list at five', () => {
  const many = Array.from({ length: 9 }, (_, i) => item({ name: `Item ${i}` }));
  assert.equal(parseMenuItems(JSON.stringify({ items: many })).items.length, 5);
});

test('a menu item becomes a saved food branded with the restaurant, with how to order it', () => {
  const [it] = parseMenuItems(JSON.stringify({ items: [item({ source: 'estimate' })] }), { restaurant: 'Chipotle' }).items;
  const f = menuItemToFood(it, 'Chipotle');
  assert.equal(f.brand, 'Chipotle');
  assert.equal(f.portion, 420);
  assert.equal(f.unit, 'g');
  assert.equal(f.nutrition.calories, 520);
  assert.match(f.notes, /Order: No rice/);
  assert.match(f.notes, /AI estimate/);
  const [web] = parseMenuItems(JSON.stringify({ items: [item()] })).items;
  assert.doesNotMatch(menuItemToFood(web, 'Chipotle').notes, /AI estimate/);
});

test('recent restaurants: newest first, no duplicates, capped', () => {
  let l = [];
  for (const n of ['Chipotle', 'Subway', 'chipotle', 'Panda Express', 'A', 'B', 'C', 'D']) l = rememberRestaurant(l, n);
  assert.equal(l[0], 'D');
  assert.equal(l.length, 6);
  assert.equal(l.filter(x => x.toLowerCase() === 'chipotle').length <= 1, true);
  assert.deepEqual(rememberRestaurant(['A'], '   '), ['A']);
});

test('the chat question names the place and never looks like logging food', () => {
  const q = menuQuestion({ restaurant: 'Chipotle', focusLabel: 'getting more protein' });
  assert.match(q, /Chipotle/);
  assert.doesNotMatch(q, /\b(log|logged|had|ate|eaten|drank|add|track)\b/i);
});
