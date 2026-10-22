/** Shopping list helpers (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aisleOf, itemsToShopping, mergeShopping, addManualItem, toggleItem, removeItem, clearChecked,
  qtyText, groupByAisle, shoppingToText, remainingCount, AISLES,
} from '../src/lib/shopping.js';

const e = (name, quantity, portion, unit) => ({ name, quantity, portion, unit });

test('aisles: from the built-in category, with sensible exceptions, then by words', () => {
  assert.equal(aisleOf('Banana'), 'Produce');
  assert.equal(aisleOf('Broccoli, cooked'), 'Produce');
  assert.equal(aisleOf('Chicken breast, cooked'), 'Meat & fish');
  assert.equal(aisleOf('Egg, large'), 'Dairy & eggs');
  assert.equal(aisleOf('Greek yogurt, plain nonfat'), 'Dairy & eggs');
  assert.equal(aisleOf('Black beans, cooked'), 'Pantry');
  assert.equal(aisleOf('Tofu, firm'), 'Pantry');
  assert.equal(aisleOf('Brown rice, cooked'), 'Bread & grains');
  assert.equal(aisleOf('Almonds'), 'Pantry');
  assert.equal(aisleOf('Orange juice'), 'Drinks');
  assert.equal(aisleOf('Rotisserie chicken from the deli'), 'Meat & fish');   // not in the library: by words
  assert.equal(aisleOf('Dish soap'), 'Other');
});

test('the same food is added together, per unit', () => {
  const l = itemsToShopping([
    e('Brown rice, cooked', 2, 1, 'cup'), e('Brown rice, cooked', 1, 1, 'cup'),
    e('Chicken breast, cooked', 1.5, 3, 'oz'), e('Banana', 2, 1, 'medium'),
  ]);
  const get = (n) => l.find(i => i.name === n);
  assert.equal(get('Brown rice, cooked').qty, 3);
  assert.equal(get('Chicken breast, cooked').qty, 4.5);
  assert.equal(get('Banana').qty, 2);
  assert.equal(l.length, 3);
  // different units of the same food stay separate lines
  assert.equal(itemsToShopping([e('Oats', 1, 1, 'cup'), e('Oats', 1, 40, 'g')]).length, 2);
});

test('quick calories and nameless rows are ignored', () => {
  assert.equal(itemsToShopping([{ type: 'quick_calories', name: 'Quick Calories', quantity: 1 }, null, {}]).length, 0);
});

test('merging sums matching items, adds new ones and un-checks a re-added item', () => {
  let list = itemsToShopping([e('Banana', 2, 1, 'medium'), e('Apple', 1, 1, 'medium')]);
  list = toggleItem(list, list.find(i => i.name === 'Banana').id);
  const merged = mergeShopping(list, itemsToShopping([e('Banana', 3, 1, 'medium'), e('Pear', 1, 1, 'medium')]));
  const banana = merged.find(i => i.name === 'Banana');
  assert.equal(banana.qty, 5);
  assert.equal(banana.checked, false);
  assert.equal(merged.length, 3);
  assert.equal(list.find(i => i.name === 'Banana').checked, true, 'input list not mutated');
});

test('manual items: added once, no amount, own aisle by name', () => {
  let l = addManualItem([], '  Paper towels ');
  assert.equal(l.length, 1);
  assert.equal(l[0].qty, 0);
  assert.equal(qtyText(l[0]), '');
  assert.equal(addManualItem(l, 'paper towels').length, 1);
  assert.equal(addManualItem(l, '   ').length, 1);
  assert.equal(addManualItem([], 'Bananas')[0].aisle, 'Produce');
});

test('check, remove, clear checked, count', () => {
  let l = itemsToShopping([e('Banana', 1, 1, 'medium'), e('Apple', 1, 1, 'medium'), e('Pear', 1, 1, 'medium')]);
  l = toggleItem(l, l[0].id); l = toggleItem(l, l[1].id);
  assert.equal(remainingCount(l), 1);
  assert.equal(clearChecked(l).length, 1);
  assert.equal(removeItem(l, l[2].id).length, 2);
});

test('quantity text', () => {
  assert.equal(qtyText({ qty: 3, unit: 'cup' }), '3 cup');
  assert.equal(qtyText({ qty: 1.5, unit: '' }), '1.5');
  assert.equal(qtyText({ qty: 0.5, unit: 'avocado' }), '0.5 avocado');
});

test('grouped in store order, unchecked first, empty aisles dropped', () => {
  let l = itemsToShopping([e('Chicken breast, cooked', 1, 3, 'oz'), e('Banana', 1, 1, 'medium'), e('Apple', 1, 1, 'medium'), e('Brown rice, cooked', 1, 1, 'cup')]);
  l = toggleItem(l, l.find(i => i.name === 'Apple').id);
  const g = groupByAisle(l);
  assert.deepEqual(g.map(x => x.aisle), ['Produce', 'Meat & fish', 'Bread & grains']);
  assert.deepEqual(g[0].items.map(i => i.name), ['Banana', 'Apple']);       // unchecked Banana before checked Apple
  assert.ok(AISLES.indexOf(g[0].aisle) < AISLES.indexOf(g[2].aisle));
});

test('share text lists what is still to buy, by aisle', () => {
  let l = itemsToShopping([e('Banana', 2, 1, 'medium'), e('Apple', 1, 1, 'medium'), e('Chicken breast, cooked', 2, 3, 'oz')]);
  l = toggleItem(l, l.find(i => i.name === 'Apple').id);
  const t = shoppingToText(l, { title: 'Groceries' });
  assert.match(t, /^Groceries/);
  assert.match(t, /Produce\n- Banana \(2 medium\)/);
  assert.match(t, /Meat & fish\n- Chicken breast, cooked \(6 oz\)/);
  assert.doesNotMatch(t, /Apple/);
});
