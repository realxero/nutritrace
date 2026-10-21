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
