// Fork: Trace's log_food must save the calories it reports (the 41-vs-170 kcal bug).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiDiaryItem } from '../src/lib/ai-portion.js';

const shake = {
  name: 'Fairlife Core Power Vanilla', portion: 100, unit: 'g', nutrition_basis: 'ml',
  nutrition: { calories: 41, proteins: 6.3, carbohydrates: 1.4, fat: 1.1 },
};

test('414 ml of a per-100 ml food saves ~170 kcal, not 41', () => {
  const r = buildAiDiaryItem(shake, 414, 'ml', 1);
  assert.equal(r.error, undefined);
  assert.equal(r.kcal, 170);
  assert.equal(Math.round(r.item.nutrition.proteins), 26);
  assert.equal(r.item.portion, 414);
});

test('no portion given → the food as stored', () => {
  const r = buildAiDiaryItem(shake, null, null, 1);
  assert.equal(r.kcal, 41);
});

test('quantity multiplies', () => {
  assert.equal(buildAiDiaryItem(shake, 414, 'ml', 2).kcal, 339);
});

test('unconvertible unit is refused instead of logging x0.01', () => {
  const r = buildAiDiaryItem(shake, 1, 'bottle', 1);
  assert.match(r.error, /can't be converted/);
});

test('alt_units row makes "bottle" convertible', () => {
  const r = buildAiDiaryItem({ ...shake, alt_units: [{ abbr: 'bottle', grams: 414 }] }, 1, 'bottle', 1);
  assert.equal(r.error, undefined);
  assert.ok(r.kcal > 150 && r.kcal < 190, `got ${r.kcal}`);
});

test('impossible energy density is refused', () => {
  const r = buildAiDiaryItem({ name: 'x', portion: 10, unit: 'g', nutrition: { calories: 500 } }, 10, 'g', 1);
  assert.match(r.error, /more energy than pure fat/);
});

test('calories vs macros mismatch warns but still logs', () => {
  const r = buildAiDiaryItem({ name: 'y', portion: 100, unit: 'g', nutrition: { calories: 500, proteins: 1, carbohydrates: 1, fat: 1 } }, 100, 'g', 1);
  assert.equal(r.error, undefined);
  assert.equal(r.warnings.length, 1);
});

test('per-100 database entry with no amount is refused (the 27-kcal iced tea)', () => {
  const tea = { name: 'Pure Leaf Lemon', barcode: '0123', portion: 100, unit: 'g', nutrition: { calories: 27, carbohydrates: 6.9 } };
  const r = buildAiDiaryItem(tea, null, null, 1, { perHundredNeedsPortion: true });
  assert.match(r.error, /stored per 100 g/);
  const ok = buildAiDiaryItem(tea, 547, 'ml', 1, { perHundredNeedsPortion: true });
  assert.equal(ok.error, undefined);
  assert.equal(ok.kcal, 148);
});

test("the user's own per-100 foods (no barcode) still log without an amount", () => {
  const own = { name: 'My granola', portion: 100, unit: 'g', nutrition: { calories: 450 } };
  assert.equal(buildAiDiaryItem(own, null, null, 1, { perHundredNeedsPortion: false }).kcal, 450);
});

test('expected_kcal: more than 20% off is refused; close enough logs', () => {
  const tea = { name: 'Pure Leaf Lemon', barcode: '0123', portion: 100, unit: 'g', nutrition: { calories: 27 } };
  assert.match(buildAiDiaryItem(tea, 100, 'g', 1, { expectedKcal: 150 }).error, /would log 27 kcal/);
  assert.equal(buildAiDiaryItem(tea, 547, 'ml', 1, { expectedKcal: 150 }).kcal, 148);
});
