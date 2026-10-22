/** Monthly recap (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecap, previousMonth, monthLabel, recapText } from '../src/lib/recap.js';
import { smoothWeights } from '../src/lib/weight-history.js';
import { buildProgress } from '../src/lib/progress.js';
import { addDays } from '../src/lib/goal-projection.js';

const day = (date, calories = 1900, protein = 120) => ({ date, calories, protein, logged: true });
const month = '2026-10';
const octDays = (n, cal = 1900) => Array.from({ length: n }, (_, i) => day(addDays('2026-10-01', i), cal));

test('previous month and labels, including the year boundary', () => {
  assert.equal(previousMonth('2026-11-03'), '2026-10');
  assert.equal(previousMonth('2027-01-15'), '2026-12');
  assert.equal(monthLabel('2026-10'), 'October 2026');
});

test('not enough logged days means no recap, rather than a thin one', () => {
  assert.equal(buildRecap({ days: octDays(7), month }), null);
  assert.ok(buildRecap({ days: octDays(8), month }));
  assert.equal(buildRecap({ days: [], month }), null);
});

test('days logged, averages and how often you landed within your goal', () => {
  const days = [...octDays(20, 1900), ...octDays(31).slice(20).map(d => ({ ...d, calories: 2300 }))];
  const r = buildRecap({ days, calorieGoal: 2000, month });
  assert.equal(r.daysLogged, 31);
  assert.equal(r.daysInMonth, 31);
  assert.equal(r.withinGoal, 20);
  assert.equal(r.fullyLogged, 31);
  assert.equal(r.avgCalories, Math.round((20 * 1900 + 11 * 2300) / 31));
  assert.equal(r.avgProtein, 120);
  assert.match(r.headline, /You logged 31 of 31 days/);
  assert.match(r.headline, /On 20 of your 31 fully logged days you finished within your calorie goal/);
});

test('half-logged days do not count as "within goal"', () => {
  const days = [...octDays(10, 1900), ...octDays(20).slice(10).map(d => ({ ...d, calories: 600 }))];
  const r = buildRecap({ days, calorieGoal: 2000, month });
  assert.equal(r.fullyLogged, 10);
  assert.equal(r.withinGoal, 10);
});

test('weight down: the change, in the right unit, with a real-world comparison', () => {
  const series = smoothWeights([{ d: '2026-09-28', kg: 91 }, { d: '2026-10-10', kg: 90.4 }, { d: '2026-10-20', kg: 90.0 }, { d: '2026-10-30', kg: 89.6 }]);
  const r = buildRecap({ days: octDays(20), series, month, unit: 'lb' });
  assert.equal(r.direction, 'down');
  assert.ok(r.changeKg < 0);
  assert.match(r.headline, /your weight trended down [\d.]+ lb/);
  assert.match(r.headline, /about the weight of/);
  const k = buildRecap({ days: octDays(20), series, month, unit: 'kg' });
  assert.match(k.headline, /trended down [\d.]+ kg/);
});

test('weight up is stated plainly, with no scolding and no celebration', () => {
  const series = smoothWeights([{ d: '2026-09-28', kg: 90 }, { d: '2026-10-15', kg: 91.5 }, { d: '2026-10-30', kg: 92.5 }]);
  const r = buildRecap({ days: octDays(20), series, month });
  assert.equal(r.direction, 'up');
  assert.match(r.headline, /trended up/);
  assert.doesNotMatch(r.headline, /great|congrat|oops|failed|bad|careful/i);
});

test('flat weight and no weight data are handled', () => {
  const flat = smoothWeights([{ d: '2026-09-28', kg: 90 }, { d: '2026-10-15', kg: 90.02 }, { d: '2026-10-30', kg: 90.05 }]);
  assert.match(buildRecap({ days: octDays(20), series: flat, month }).headline, /held steady/);
  const none = buildRecap({ days: octDays(20), series: [], month });
  assert.equal(none.changeKg, null);
  assert.doesNotMatch(none.headline, /weight/);
});

test('what was earned that month, best streak and perfect weeks', () => {
  const days = octDays(31);
  const series = smoothWeights(Array.from({ length: 16 }, (_, i) => ({ d: addDays('2026-10-01', i * 2), kg: 90 - i * 0.2 })));
  const events = buildProgress({ days, series, goalKg: 85, today: '2026-11-02', calorieGoal: 2000, unit: 'lb' }).events;
  const r = buildRecap({ days, series, events, calorieGoal: 2000, month });
  assert.equal(r.longestStreak, 31);
  assert.ok(r.perfectWeeks >= 3);
  assert.ok(r.earned.some(e => e.id === 'days:25'));
  assert.ok(r.earned.every(e => e.date.startsWith('2026-10')));
  for (let i = 1; i < r.earned.length; i++) assert.ok(r.earned[i - 1].date <= r.earned[i].date);
});

test('share text', () => {
  const r = buildRecap({ days: octDays(20), calorieGoal: 2000, month });
  const t = recapText(r);
  assert.match(t, /^October 2026 recap/);
  assert.match(t, /Days logged: 20 of 31/);
  assert.match(t, /Average: 1,900 kcal \(goal 2,000\), 120 g protein/);
  assert.equal(recapText(null), '');
});
