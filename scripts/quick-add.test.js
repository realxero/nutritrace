import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultMealForNow } from '../src/lib/quick-add.js';

const at = (h, m = 0) => new Date(2026, 9, 21, h, m);

test('time of day picks the meal', () => {
  assert.equal(defaultMealForNow(4, at(7)), 0);
  assert.equal(defaultMealForNow(4, at(10, 29)), 0);
  assert.equal(defaultMealForNow(4, at(10, 30)), 1);
  assert.equal(defaultMealForNow(4, at(12, 30)), 1);
  assert.equal(defaultMealForNow(4, at(15)), 2);
  assert.equal(defaultMealForNow(4, at(19)), 2);
  assert.equal(defaultMealForNow(4, at(20, 30)), 3);
  assert.equal(defaultMealForNow(4, at(23, 4)), 3);   // the 23:04 in the screenshot
});

test('fewer meals than four clamps to the last one', () => {
  assert.equal(defaultMealForNow(3, at(23)), 2);
  assert.equal(defaultMealForNow(2, at(18)), 1);
  assert.equal(defaultMealForNow(1, at(18)), 0);
  assert.equal(defaultMealForNow(0, at(18)), 0);
});
