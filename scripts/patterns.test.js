/** Diary patterns: only real, big-enough, statistically clear ones (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { findPatterns, welchT, propZ } from '../src/lib/patterns.js';
import { addDays } from '../src/lib/goal-projection.js';

// deterministic pseudo-noise
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const noise = (amp) => (rnd() - 0.5) * 2 * amp;

const item = (name, kcal, meal = 1, protein = 0) => ({ name, quantity: 1, meal, nutrition: { calories: kcal, proteins: protein } });
const start = '2026-08-01';
const goal = 2000;

/** n days; build(i) returns that day's items. */
const makeDays = (n, build) => Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), items: build(i) }));
const base = (i, extra = []) => [item('Toast', 300 + noise(40), 0, 8), item('Chicken bowl', 700 + noise(80), 1, 40), item('Pasta', 600 + noise(80), 2, 18), ...extra];

test('statistics helpers', () => {
  assert.ok(welchT([10, 11, 12, 11, 10, 12], [20, 21, 19, 22, 20, 21]) < -5);
  assert.equal(welchT([1], [2, 3]), 0);
  assert.ok(propZ(8, 10, 2, 10) > 2);
  assert.equal(propZ(0, 10, 0, 10), 0);
});

test('a food that really goes with lighter days is found, with how many days it rests on', () => {
  seed = 11;
  const days = makeDays(60, i => base(i, i % 3 === 0 ? [item('Greek yogurt', 120, 3, 17)] : [item('Chips', 380 + noise(60), 3), item('Cookie', 200 + noise(40), 3)]));
  const { patterns, daysUsed } = findPatterns({ days, calorieGoal: goal });
  assert.equal(daysUsed, 60);
  const p = patterns.find(x => x.kind === 'eat-less' && x.food === 'greek yogurt');
  assert.ok(p, 'yogurt pattern expected');
  assert.ok(p.deltaKcal >= 400 && p.deltaKcal <= 700, `delta ${p.deltaKcal}`);
  assert.equal(p.n, 20);
  assert.match(p.text, /On days you have greek yogurt, you tend to eat about \d+ kcal less for the rest of the day/);
  assert.ok(['strong', 'hint'].includes(p.strength));
});

test('a food that goes with going over the goal is found, as a share of days', () => {
  seed = 21;
  const days = makeDays(60, i => base(i, i % 3 === 0 ? [item('Pizza', 900, 3), item('Soda', 300, 3)] : [item('Apple', 90, 3)]));
  const { patterns } = findPatterns({ days, calorieGoal: goal });
  const over = patterns.find(x => x.kind === 'over' && x.food === 'pizza');
  assert.ok(over, 'over-goal pattern expected');
  assert.ok(over.withOver >= 90 && over.withoutOver <= 10, `${over.withOver} vs ${over.withoutOver}`);
  assert.match(over.text, /Days with pizza end over your calorie goal \d+% of the time, compared with \d+% of other days/);
});

test('breakfast protein: found when it truly changes the rest of the day', () => {
  seed = 31;
  const days = makeDays(60, i => {
    const high = i % 2 === 0;
    return [item(high ? 'Eggs and Greek yogurt' : 'Pastry', high ? 350 : 380, 0, high ? 30 : 5), item('Lunch plate', (high ? 600 : 900) + noise(60), 1, 30), item('Dinner plate', (high ? 650 : 900) + noise(60), 2, 30)];
  });
  const { patterns } = findPatterns({ days, calorieGoal: goal });
  const b = patterns.find(x => x.kind === 'breakfast-less');
  assert.ok(b);
  assert.ok(b.deltaKcal >= 400);
  assert.match(b.text, /20 g or more of protein at breakfast/);
});

test('weekday: a heavy Saturday is found and named', () => {
  seed = 41;
  const days = makeDays(84, i => { const wd = new Date(2026, 7, 1 + i, 12).getDay(); return [item('Meal A', 700 + noise(60), 1), item('Meal B', 700 + noise(60), 2), item('Meal C', (wd === 6 ? 1100 : 500) + noise(60), 3)]; });
  const { patterns } = findPatterns({ days, calorieGoal: goal });
  const w = patterns.find(x => x.kind === 'weekday');
  assert.ok(w);
  assert.equal(w.weekday, 6);
  assert.match(w.text, /more on Saturdays/);
});

test('pure noise finds nothing', () => {
  seed = 51;
  const names = ['Rice', 'Beans', 'Salad', 'Soup', 'Fish', 'Eggs', 'Toast', 'Fruit'];
  const days = makeDays(90, () => {
    const picks = names.filter(() => rnd() < 0.4);
    return [item('Base meal', 1500 + noise(250), 1), ...picks.map(n => item(n, 100 + noise(20), 2))];
  });
  assert.equal(findPatterns({ days, calorieGoal: goal }).patterns.length, 0);
});

test('too little history, or a food on almost every day, is not reported', () => {
  seed = 61;
  assert.equal(findPatterns({ days: makeDays(8, i => base(i)), calorieGoal: goal }).patterns.length, 0);
  const days = makeDays(40, i => base(i, [item('Coffee', 5, 0)]).concat(i < 5 ? [item('Cake', 500, 3)] : []));
  assert.ok(!findPatterns({ days, calorieGoal: goal }).patterns.some(p => p.food === 'coffee'));
});

test('half-logged days are left out, so they cannot fake a light day', () => {
  seed = 71;
  const days = makeDays(40, i => i % 4 === 0 ? [item('Greek yogurt', 120, 0, 17)] : base(i));       // those "yogurt days" are barely logged
  const { patterns, daysUsed } = findPatterns({ days, calorieGoal: goal });
  assert.equal(daysUsed, 30);
  assert.ok(!patterns.some(p => p.food === 'greek yogurt'));
});

test('the strongest come first, and the list is capped', () => {
  seed = 81;
  const days = makeDays(70, i => base(i, i % 2 === 0 ? [item('Salad', 150, 3)] : [item('Fries', 600, 3), item('Burger', 700, 3)]));
  const r = findPatterns({ days, calorieGoal: goal, limit: 2 });
  assert.ok(r.patterns.length <= 2);
  for (let i = 1; i < r.patterns.length; i++) assert.ok(r.patterns[i - 1].score >= r.patterns[i].score);
});

test('wording: always a tendency with its evidence, never a claim of cause', () => {
  seed = 91;
  const days = makeDays(60, i => base(i, i % 3 === 0 ? [item('Greek yogurt', 120, 3, 17)] : [item('Chips', 380, 3), item('Cookie', 200, 3)]));
  const { patterns } = findPatterns({ days, calorieGoal: goal });
  assert.ok(patterns.length > 0);
  for (const p of patterns) {
    assert.match(p.text, /tend to|of the time/);
    assert.doesNotMatch(p.text, /\b(because|causes?|makes? you|will make)\b/i);
    assert.ok(p.n >= 6 && p.nOther >= 4, 'the evidence is stated');
  }
});
