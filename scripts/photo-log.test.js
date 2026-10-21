// Fork: photo logging validates what the AI returns before anything is saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEstimate, _altUnitsFor } from '../src/lib/photo-log.js';

const good = {
  name: 'Fairlife Core Power Vanilla', brand: 'Fairlife',
  serving: { amount: 414, unit: 'ml', label: '1 bottle (14 fl oz)' },
  nutrition: { calories: 170, proteins: 26, carbohydrates: 6, fat: 4.5, bogus: 9 },
  confidence: 'high',
};

test('a good estimate passes through, unknown nutrients dropped', () => {
  const e = normalizeEstimate(good);
  assert.equal(e.amount, 414);
  assert.equal(e.unit, 'ml');
  assert.equal(e.nutrition.calories, 170);
  assert.equal(e.nutrition.bogus, undefined);
  assert.deepEqual(e.warnings, []);
});

test('"no food" reply becomes a clear error', () => {
  assert.throws(() => normalizeEstimate({ error: 'just a table' }), /No food found/);
});

test('impossible density rejected; missing calories rejected', () => {
  assert.throws(() => normalizeEstimate({ ...good, serving: { amount: 10, unit: 'g' }, nutrition: { calories: 500 } }), /impossible/);
  assert.throws(() => normalizeEstimate({ ...good, nutrition: { proteins: 5 } }), /calories/);
});

test('macro mismatch and low confidence produce warnings', () => {
  const e = normalizeEstimate({ ...good, nutrition: { calories: 600, proteins: 1, carbohydrates: 1, fat: 1 }, confidence: 'low' });
  assert.equal(e.warnings.length, 2);
});

test('odd units fall back to grams; bad amount falls back to 100', () => {
  const e = normalizeEstimate({ ...good, serving: { amount: -5, unit: 'cups' } });
  assert.equal(e.unit, 'g');
  assert.equal(e.amount, 100);
});

test('count labels become alt units; plain sizes do not', () => {
  assert.deepEqual(_altUnitsFor('1 bottle (14 fl oz)', 414), [{ abbr: 'bottle', grams: 414 }]);
  assert.deepEqual(_altUnitsFor('2 slices', 70), [{ abbr: 'slice', grams: 35 }]);
  assert.equal(_altUnitsFor('20 oz', 591), null);
  assert.equal(_altUnitsFor('', 100), null);
});

import { portionOf } from '../src/lib/photo-log.js';

test('divisible + question are parsed and validated', () => {
  const e = normalizeEstimate({ ...good, divisible: { count: 8, unit: 'Slice' },
    question: { text: 'Pepperoni or cheese?', choices: ['Pepperoni', 'Cheese'] } });
  assert.deepEqual(e.divisible, { count: 8, unit: 'slice' });
  assert.equal(e.question.choices.length, 2);
  const bad = normalizeEstimate({ ...good, divisible: { count: 1, unit: 'slice' }, question: { text: 'x', choices: ['only one'] } });
  assert.equal(bad.divisible, null);
  assert.equal(bad.question, null);
});

test('portionOf: 2 of 8 slices is a quarter of everything', () => {
  const whole = normalizeEstimate({ name: 'Pepperoni pizza', serving: { amount: 800, unit: 'g', label: '1 large pizza' },
    nutrition: { calories: 2400, proteins: 100, carbohydrates: 260, fat: 100 }, divisible: { count: 8, unit: 'slice' } });
  const two = portionOf(whole, 2);
  assert.equal(two.amount, 200);
  assert.equal(two.nutrition.calories, 600);
  assert.equal(two.label, '2 slices of 8');
  assert.equal(two.wholeAmount, 800);
  assert.equal(portionOf(whole, 1).label, '1 slice of 8');
  assert.equal(portionOf(whole, 8).nutrition.calories, 2400);
  assert.equal(portionOf(whole, 4).nutrition.calories, 1200);
});
