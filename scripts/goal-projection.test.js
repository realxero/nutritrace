/** Goal-weight projection maths (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { projectGoal, addDays, daysBetween } from '../src/lib/goal-projection.js';

const today = '2026-10-21';
const base = { currentKg: 90, targetKg: 80, tdee: 2800, tdeeIsAdaptive: true, avgIntake: 2300, loggedDays: 12, trendKgPerWeek: -0.45, today };

test('date helpers cross month and DST boundaries', () => {
  assert.equal(addDays('2026-10-21', 10), '2026-10-31');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-07', 2), '2026-03-09');
  assert.equal(daysBetween('2026-10-21', '2026-12-21'), 61);
});

test('no target / no weight / at goal', () => {
  assert.equal(projectGoal({ today }).status, 'no-target');
  assert.equal(projectGoal({ targetKg: 80, today }).status, 'no-weight');
  assert.equal(projectGoal({ currentKg: 80.1, targetKg: 80, today }).status, 'reached');
});

test('losing: range from intake pace and measured trend', () => {
  const r = projectGoal(base);
  assert.equal(r.status, 'ok');
  assert.equal(r.direction, 'lose');
  assert.equal(r.basis, 'logged');
  assert.equal(r.confidence, 'good');
  // intake pace = -500*7/7700 = -0.45 kg/wk; both rates agree
  assert.equal(r.ratePerWeekKg, -0.45);
  assert.ok(r.daysEarliest < r.daysLatest);
  assert.ok(r.earliest < r.latest);
  // 10 kg at ~0.45 kg/wk ≈ 156 days; range must contain that
  assert.ok(r.daysEarliest <= 156 && r.daysLatest >= 156);
});

test('range widens when intake pace and trend disagree', () => {
  const agree = projectGoal(base);
  const split = projectGoal({ ...base, trendKgPerWeek: -0.25 });
  assert.ok(split.daysLatest - split.daysEarliest > agree.daysLatest - agree.daysEarliest);
});

test('gaining works the same way', () => {
  const r = projectGoal({ ...base, currentKg: 70, targetKg: 75, avgIntake: 3100, trendKgPerWeek: 0.2 });
  assert.equal(r.direction, 'gain');
  assert.equal(r.status, 'ok');
  assert.ok(r.ratePerWeekKg > 0);
});

test('deficit of zero or the wrong way gives no date', () => {
  assert.equal(projectGoal({ ...base, avgIntake: 2800, trendKgPerWeek: 0 }).status, 'no-progress');
  const w = projectGoal({ ...base, avgIntake: 3300, trendKgPerWeek: 0.4 });
  assert.equal(w.status, 'wrong-way');
  assert.equal(w.earliest, null);
});

test('too few logged days: no intake-based estimate, asks for more', () => {
  const r = projectGoal({ ...base, loggedDays: 2, trendKgPerWeek: null, tdeeIsAdaptive: false });
  assert.equal(r.status, 'no-estimate');
  assert.equal(r.needMoreDays, 8);
});

test('few logged days but a measured trend still projects, flagged as low confidence', () => {
  const r = projectGoal({ ...base, loggedDays: 2 });
  assert.equal(r.status, 'ok');
  assert.equal(r.confidence, 'low');
  assert.equal(r.needMoreDays, 8);
});

test('more logged days tightens confidence', () => {
  assert.equal(projectGoal({ ...base, loggedDays: 6 }).confidence, 'fair');
  assert.equal(projectGoal({ ...base, loggedDays: 14 }).confidence, 'good');
  assert.equal(projectGoal({ ...base, loggedDays: 14 }).needMoreDays, 0);
});

test('plan view when nothing is logged yet', () => {
  const r = projectGoal({ currentKg: 90, targetKg: 80, tdee: 2800, tdeeIsAdaptive: false, plannedIntake: 2300, loggedDays: 0, today });
  assert.equal(r.status, 'ok');
  assert.equal(r.basis, 'plan');
  assert.equal(r.confidence, 'low');
});

test('target date: required calories, on-track verdicts', () => {
  const r = projectGoal({ ...base, targetDate: addDays(today, 200) });
  assert.equal(r.required.daysLeft, 200);
  // 10 kg * 7700 / 200 = 385 kcal/day deficit
  assert.equal(r.required.dailyBalance, -385);
  assert.equal(r.required.kcalPerDay, 2415);
  assert.ok(['ahead', 'on-track'].includes(r.onTrack));
  const behind = projectGoal({ ...base, targetDate: addDays(today, 60) });
  assert.equal(behind.onTrack, 'behind');
});

test('aggressive and very-low-calorie targets are flagged', () => {
  const r = projectGoal({ ...base, targetDate: addDays(today, 30) });
  assert.ok(r.required.aggressive);
  assert.ok(r.required.belowFloor);
  assert.ok(r.warnings.includes('aggressive'));
  assert.ok(r.warnings.includes('low-calories'));
  const calm = projectGoal({ ...base, targetDate: addDays(today, 300) });
  assert.deepEqual(calm.warnings, []);
});

test('a target date in the past is reported, not computed', () => {
  const r = projectGoal({ ...base, targetDate: '2026-10-01' });
  assert.equal(r.required.past, true);
});

test('very slow pace is reported as far away, not a silly date', () => {
  const r = projectGoal({ ...base, avgIntake: 2750, trendKgPerWeek: -0.04 });
  assert.ok(['far-away', 'ok'].includes(r.status));
  if (r.status === 'far-away') assert.equal(r.earliest, null);
});

import { projectFromAdaptive, suggestAdjustment, adjustmentText } from '../src/lib/goal-projection.js';

const adaptive = { ready: true, tdee: 2800, trendKgPerWeek: -0.45, trendWeightKg: 90, recentAvgIntake: 2300, recentLoggedDays: 12 };

test('projectFromAdaptive matches projectGoal and names the weight source', () => {
  const { result, currentKg, weightFrom } = projectFromAdaptive({ adaptive, targetKg: 80, today });
  assert.equal(currentKg, 90);
  assert.equal(weightFrom, 'trend');
  assert.equal(result.status, 'ok');
  const p = projectFromAdaptive({ adaptive: null, targetKg: 80, profileKg: 91, profileTdee: 2800, plannedIntake: 2300, today });
  assert.equal(p.weightFrom, 'profile');
  assert.equal(p.result.basis, 'plan');
});

test('adjustment: eat less when behind a date, more when well ahead, none without a date', () => {
  const adj = (days, intake = 2300) => {
    const { result } = projectFromAdaptive({ adaptive: { ...adaptive, recentAvgIntake: intake }, targetKg: 80, targetDate: addDays(today, days), today });
    return suggestAdjustment(result, intake, 12);
  };
  const behind = adj(240);              // needs ~ -320 kcal; eating -500: room to spare
  assert.equal(behind.kind, 'more');
  const tight = adj(120);               // needs ~ -640
  assert.equal(tight.kind, 'less');
  assert.equal(tight.deltaKcal % 50, 0);
  assert.equal(adj(156).kind, 'on-track');
  const { result } = projectFromAdaptive({ adaptive, targetKg: 80, today });
  assert.equal(suggestAdjustment(result, 2300, 12), null);
});

test('adjustment: a date that needs a very low intake is flagged, not chased', () => {
  const { result } = projectFromAdaptive({ adaptive, targetKg: 80, targetDate: addDays(today, 30), today });
  assert.equal(suggestAdjustment(result, 2300, 12).kind, 'too-soon');
});

test('adjustment needs enough logged days', () => {
  const { result } = projectFromAdaptive({ adaptive, targetKg: 80, targetDate: addDays(today, 120), today });
  assert.equal(suggestAdjustment(result, 2300, 2), null);
});

test('adjustment text', () => {
  assert.match(adjustmentText({ kind: 'less', deltaKcal: 300 }, 'Mar 3'), /300 kcal a day less/);
  assert.match(adjustmentText({ kind: 'more', deltaKcal: 150 }, 'Mar 3'), /150 kcal a day more/);
  assert.equal(adjustmentText(null), '');
});
