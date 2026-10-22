/** Diary heads-ups from patterns (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { findNudges } from '../src/lib/nudges.js';

const over = { kind: 'over', food: 'pizza', withOver: 90, withoutOver: 8, n: 20, nOther: 40 };
const sat = { kind: 'weekday', weekday: 6, dir: 'more', deltaKcal: 380, n: 12, nOther: 70 };
const item = (name, extra = {}) => ({ name, quantity: 1, nutrition: { calories: 300 }, ...extra });
const base = { date: '2026-10-24', today: '2026-10-22', completed: false };   // 2026-10-24 is a Saturday

test('a food that usually goes with going over, when it is on the day, gets a heads-up with the evidence', () => {
  const n = findNudges({ ...base, date: base.today, patterns: [over], items: [item('Pizza')], kcalLeft: 650 });
  assert.equal(n.length, 1);
  assert.equal(n[0].kind, 'food-over');
  assert.match(n[0].text, /Days with pizza usually end over your calorie goal \(90% of the time, vs 8% otherwise\)/);
  assert.match(n[0].sub, /650 kcal left/);
});

test('nothing when the food is not on the day, or the pattern is not an "over" one', () => {
  assert.deepEqual(findNudges({ ...base, date: base.today, patterns: [over], items: [item('Apple')] }), []);
  assert.deepEqual(findNudges({ ...base, date: base.today, patterns: [{ ...over, kind: 'eat-less' }], items: [item('Pizza')] }), []);
});

test('a heavy weekday is flagged on that weekday, for today or a day ahead, but not on other days', () => {
  const n = findNudges({ ...base, patterns: [sat], items: [] });
  assert.equal(n.length, 1);
  assert.match(n[0].text, /Saturdays tend to run about 380 kcal heavier/);
  assert.deepEqual(findNudges({ ...base, date: '2026-10-25', patterns: [sat], items: [] }), []);          // a Sunday
  assert.deepEqual(findNudges({ ...base, patterns: [{ ...sat, dir: 'less' }], items: [] }), []);           // a light day needs no warning
});

test('past days, completed days and hidden heads-ups say nothing', () => {
  assert.deepEqual(findNudges({ ...base, date: '2026-10-20', patterns: [over], items: [item('Pizza')] }), []);
  assert.deepEqual(findNudges({ ...base, date: base.today, completed: true, patterns: [over], items: [item('Pizza')] }), []);
  const first = findNudges({ ...base, date: base.today, patterns: [over], items: [item('Pizza')] });
  assert.deepEqual(findNudges({ ...base, date: base.today, patterns: [over], items: [item('Pizza')], dismissed: [first[0].id] }), []);
});

test('quick-calorie rows never match a food, and at most two heads-ups are shown', () => {
  assert.deepEqual(findNudges({ ...base, date: base.today, patterns: [{ ...over, food: 'quick calories' }], items: [{ type: 'quick_calories', name: 'Quick Calories' }] }), []);
  const many = ['pizza', 'fries', 'soda'].map(f => ({ ...over, food: f }));
  const n = findNudges({ ...base, patterns: [...many, sat], items: many.map(m => item(m.food)) });
  assert.equal(n.length, 2);
});

test('at the goal already: said plainly, not as a scolding', () => {
  const n = findNudges({ ...base, date: base.today, patterns: [over], items: [item('Pizza')], kcalLeft: -40 });
  assert.match(n[0].sub, /at your goal/);
});
