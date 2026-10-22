/** Weight trend chart geometry (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChart } from '../src/lib/weight-chart.js';
import { projectFromAdaptive, addDays } from '../src/lib/goal-projection.js';

const today = '2026-10-22';
// 35 days of a slow loss: 90.0 kg trending to ~88.5, with daily noise; every third day measured
const series = Array.from({ length: 35 }, (_, i) => {
  const t = 90 - (i * 1.5) / 34;
  return { d: addDays(today, i - 34), kg: Math.round((t + (i % 2 ? 0.4 : -0.4)) * 100) / 100, m: i % 3 === 0 || i === 34, t: Math.round(t * 100) / 100 };
});
const adaptive = { ready: true, tdee: 2800, trendKgPerWeek: -0.3, trendWeightKg: 88.5, recentAvgIntake: 2450, recentLoggedDays: 12 };
const proj = (targetKg = 80, targetDate = null) => projectFromAdaptive({ adaptive, targetKg, targetDate, today }).result;

test('too little data draws nothing', () => {
  assert.equal(buildChart({ series: [], today }).empty, true);
  assert.equal(buildChart({ series: series.slice(0, 1), today }).empty, true);
});

test('history view: dots are only real weigh-ins, trend spans the data, no cone', () => {
  const c = buildChart({ series, targetKg: 80, projection: proj(), today, mode: 'history' });
  assert.equal(c.empty, false);
  assert.equal(c.dots.length, series.filter(s => s.m).length);
  assert.equal(c.cone, null);
  assert.match(c.trend, /^M/);
  assert.equal(c.trend.split('L').length, 35);          // every day on the smoothed line
  assert.equal(c.xMax, 1);
});

test('goal view: a cone from today to the goal line across the projected range', () => {
  const p = proj();
  const c = buildChart({ series, targetKg: 80, projection: p, today, mode: 'goal' });
  assert.ok(c.cone, 'cone expected');
  const pts = c.cone.split(' ').map(s => s.split(',').map(Number));
  assert.ok(pts.length >= 3);
  // starts at today's trend weight
  assert.equal(pts[0][0], c.trendEnd.x);
  assert.equal(pts[0][1], c.trendEnd.y);
  // fast edge ends on the goal line, slow edge on it too (it is inside the horizon)
  assert.equal(pts[1][1], c.goal.y);
  assert.equal(pts[2][1], c.goal.y);
  assert.ok(pts[2][0] > pts[1][0], 'slow edge reaches the goal later (further right)');
  assert.ok(c.eta.late > c.eta.early);
  assert.equal(c.eta.lateDate, p.latest);
});

test('the goal line and the cone fit inside the plot area', () => {
  const c = buildChart({ series, targetKg: 80, projection: proj(), today });
  const inside = (x, y) => x >= c.pad.l - 1 && x <= c.width - c.pad.r + 1 && y >= c.pad.t - 1 && y <= c.height - c.pad.b + 1;
  assert.ok(inside(c.trendEnd.x, c.goal.y));
  for (const pt of c.cone.split(' ')) { const [x, y] = pt.split(',').map(Number); assert.ok(inside(x, y), `${pt} outside`); }
  for (const d of c.dots) assert.ok(inside(d.x, d.y));
});

test('weight going up: the cone rises to the goal', () => {
  const up = series.map(s => ({ ...s, kg: 70 + (s.kg - 88) * 0.2, t: 70 + (s.t - 88) * 0.2 }));
  const a = { ready: true, tdee: 2500, trendKgPerWeek: 0.2, trendWeightKg: 70, recentAvgIntake: 2800, recentLoggedDays: 12 };
  const r = projectFromAdaptive({ adaptive: a, targetKg: 75, today }).result;
  const c = buildChart({ series: up, targetKg: 75, projection: r, today });
  const pts = c.cone.split(' ').map(s => s.split(',').map(Number));
  assert.ok(c.goal.y < c.trendEnd.y, 'goal is above today\'s weight on screen');
  assert.equal(pts[1][1], c.goal.y);
});

test('a slow pace that outruns the horizon is clipped, not drawn off the page', () => {
  const slow = { ...adaptive, trendKgPerWeek: -0.05, recentAvgIntake: 2780 };
  const r = projectFromAdaptive({ adaptive: slow, targetKg: 60, today }).result;
  if (r.status === 'ok') {
    const c = buildChart({ series, targetKg: 60, projection: r, today });
    assert.ok(c.xMax <= 365);
    for (const pt of c.cone.split(' ')) { const [x] = pt.split(',').map(Number); assert.ok(x <= c.width - c.pad.r + 1); }
  }
});

test('no estimate yet: goal view still draws history and the goal line, without a cone', () => {
  const none = projectFromAdaptive({ adaptive: null, targetKg: 80, today }).result;
  const c = buildChart({ series, targetKg: 80, projection: none, today });
  assert.equal(c.cone, null);
  assert.ok(c.goal);
  assert.ok(c.dots.length > 0);
});

test('labels: start, today, and the projected end', () => {
  const c = buildChart({ series, targetKg: 80, projection: proj(), today });
  assert.ok(c.xLabels.some(l => l.today));
  assert.ok(c.xLabels.some(l => l.eta));
  assert.equal(c.yTicks.length, 3);
});
