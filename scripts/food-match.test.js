// Fork: Smart Log match scoring ("Costco hot dog" must not become hot dog buns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevanceScore, aiCandidate, cleanEstimate, GOOD_MATCH } from '../src/lib/food-match.js';

const hotdog = { name: 'hot dog', brand: 'Costco', quantity: 1, unit: null,
  estimate: { grams: 200, calories: 550, proteins: 24, carbohydrates: 46, fat: 30 } };

test('component foods (rolls/buns) score below a good match', () => {
  for (const n of ['Sliced Hot Dog Rolls', 'White Hot Dog Buns']) {
    assert.ok(relevanceScore(hotdog, { name: n }) < GOOD_MATCH, n);
  }
});

test('a named brand that is missing pushes the score under GOOD_MATCH', () => {
  assert.ok(relevanceScore(hotdog, { name: 'Hot Dog', brand: 'Ikea' }) < GOOD_MATCH);
  assert.ok(relevanceScore(hotdog, { name: 'Hot Dog', brand: 'Costco' }) >= GOOD_MATCH);
});

test('plain exact matches score high', () => {
  const y = { name: 'greek yogurt', quantity: 1, unit: null };
  assert.ok(relevanceScore(y, { name: 'Greek Yogurt', brand: 'Chobani' }) >= 0.95);
  assert.ok(relevanceScore(y, { name: 'Plain Greek Yogurt' }) >= GOOD_MATCH);
  assert.ok(relevanceScore(y, { name: 'Greek Yogurt Dressing' }) < GOOD_MATCH);
});

test('plurals match singulars', () => {
  assert.ok(relevanceScore({ name: 'eggs' }, { name: 'Egg' }) >= GOOD_MATCH);
});

test('AI candidate is per unit, named with the brand', () => {
  const c = aiCandidate(hotdog);
  assert.equal(c.name, 'Costco Hot Dog');
  assert.equal(c.portion, 200);
  assert.equal(c.nutrition.calories, 550);
  assert.ok(c._ai);
  const eggs = aiCandidate({ name: 'eggs', quantity: 2, unit: null, estimate: { grams: 100, calories: 143 } });
  assert.equal(eggs.portion, 50);
  assert.equal(eggs.nutrition.calories, 71.5);
});

test('grams-based quantity is not divided', () => {
  const c = aiCandidate({ name: 'rice', quantity: 200, unit: 'g', estimate: { grams: 200, calories: 260 } });
  assert.equal(c.portion, 200);
  assert.equal(c.nutrition.calories, 260);
});

test('cleanEstimate rejects missing or impossible estimates', () => {
  assert.equal(cleanEstimate(null), null);
  assert.equal(cleanEstimate({ calories: 0 }), null);
  assert.equal(cleanEstimate({ grams: 10, calories: 500 }), null);
  assert.deepEqual(cleanEstimate({ calories: '120', grams: 'x', junk: 3 }), { calories: 120, grams: 100 });
});
