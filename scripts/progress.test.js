/** Streaks, milestones, achievements, real-world comparisons (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { streaks, milestoneAmounts, perfectWeeks, buildProgress, newEvents } from '../src/lib/progress.js';
import { compareKg, weightPhrase, LADDER_NAMES } from '../src/lib/weight-compare.js';
import { smoothWeights } from '../src/lib/weight-history.js';
import { addDays } from '../src/lib/goal-projection.js';

const today = '2026-11-10';
const LB = 0.45359237;

test('comparisons: the ones people know, within reason, and nothing when nothing is close', () => {
  assert.equal(compareKg(1 * LB), 'an average book');
  assert.equal(compareKg(2 * LB), 'a pineapple');
  assert.equal(compareKg(5 * LB), 'a bag of sugar');
  assert.equal(compareKg(15 * LB), 'a Thanksgiving turkey');
  assert.equal(compareKg(5.5 * LB), 'a bag of sugar');
  assert.equal(compareKg(6.9 * LB), 'a newborn baby');
  assert.equal(compareKg(0.05 * LB), null);                       // far lighter than anything listed
  assert.equal(compareKg(300 * LB), null);                        // far heavier
  assert.equal(compareKg(0), null);
  assert.match(weightPhrase(1 * LB), /^about the weight of an average book$/);
  assert.equal(weightPhrase(0), '');
  assert.ok(LADDER_NAMES.length >= 15);
});

test('milestone sizes: every pound (half kilo) first, then wider', () => {
  assert.deepEqual(milestoneAmounts('lb', 12), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(milestoneAmounts('lb', 31), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30]);
  assert.deepEqual(milestoneAmounts('kg', 3), [0.5, 1, 1.5, 2, 2.5, 3]);
  assert.deepEqual(milestoneAmounts('kg', 14), [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10, 12.5]);
});

test('streaks: current counts back from today, or from yesterday if today is not logged yet', () => {
  const run = (n, end) => Array.from({ length: n }, (_, i) => addDays(end, -i));
  assert.deepEqual(streaks(run(5, today), today), { current: 5, longest: 5 });
  assert.deepEqual(streaks(run(5, addDays(today, -1)), today), { current: 5, longest: 5 });   // yesterday counts while today is open
  assert.deepEqual(streaks(run(5, addDays(today, -2)), today), { current: 0, longest: 5 });   // broken
  assert.deepEqual(streaks([...run(15, addDays(today, -40)), ...run(3, today)], today), { current: 3, longest: 15 });
  assert.deepEqual(streaks([], today), { current: 0, longest: 0 });
});

test('perfect week: seven logged days in a row, each within the goal and not nearly empty', () => {
  const mk = (n, cal, end = today) => Array.from({ length: n }, (_, i) => ({ date: addDays(end, -(n - 1 - i)), calories: cal, logged: true }));
  assert.equal(perfectWeeks(mk(7, 2000), 2000).length, 1);
  assert.equal(perfectWeeks(mk(6, 2000), 2000).length, 0);
  assert.equal(perfectWeeks(mk(14, 2000), 2000).length, 2);
  const over = mk(7, 2000); over[3].calories = 2400;
  assert.equal(perfectWeeks(over, 2000).length, 0);
  const light = mk(7, 2000); light[2].calories = 500;
  assert.equal(perfectWeeks(light, 2000).length, 0);
  assert.equal(perfectWeeks(mk(7, 2000), null).length, 0);
});

// 60 days of a steady loss from 100 kg toward 90, weighed every other day
const start = addDays(today, -60);
const weights = Array.from({ length: 31 }, (_, i) => ({ d: addDays(start, i * 2), kg: Math.round((100 - i * 0.12 + (i % 2 ? 0.3 : -0.3)) * 100) / 100 }));
const series = smoothWeights(weights);
const days = Array.from({ length: 50 }, (_, i) => ({ date: addDays(today, -49 + i), calories: 1900, logged: true }));

test('progress: start, where you are, the fraction of the way, and the next milestone with a real-world comparison', () => {
  const p = buildProgress({ days, series, goalKg: 90, today, calorieGoal: 2000, unit: 'lb' });
  assert.equal(p.direction, 'lose');
  assert.equal(p.start.kg, weights[0].kg);                           // the first reading
  assert.ok(p.nowKg < p.start.kg);
  assert.ok(p.fraction > 0.2 && p.fraction < 0.6, `fraction ${p.fraction}`);
  assert.ok(p.changeKg < 0);
  assert.ok(p.next && p.next.amount >= 1);
  assert.ok(p.next.remainingKg > 0);
  assert.equal(p.streak.current, 50);
  assert.equal(p.daysLogged, 50);
});

test('progress: milestones are dated in order, each at least as far down as the last, and phrased', () => {
  const p = buildProgress({ days, series, goalKg: 90, today, calorieGoal: 2000, unit: 'lb' });
  const ms = p.events.filter(e => e.kind === 'milestone').sort((a, b) => a.amount - b.amount);
  assert.ok(ms.length >= 3);
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i].date >= ms[i - 1].date, 'a bigger milestone is never earlier');
  assert.match(ms[0].title, /^Down 1 lb$/);
  assert.equal(ms[0].phrase, 'about the weight of an average book');
  // the next one is the first not yet reached
  assert.equal(p.next.amount, ms[ms.length - 1].amount + (milestoneAmounts('lb', 99).find(a => a > ms[ms.length - 1].amount) - ms[ms.length - 1].amount));
});

test('progress: achievements are dated at the Nth day, weigh-in, streak length and perfect week', () => {
  const p = buildProgress({ days, series, goalKg: 90, today, calorieGoal: 2000, unit: 'lb' });
  const byId = Object.fromEntries(p.events.map(e => [e.id, e]));
  assert.equal(byId['days:25'].date, days[24].date);
  assert.equal(byId['days:50'].date, days[49].date);
  assert.ok(byId['weights:10'], '10 weights logged');
  assert.equal(byId['weights:25'].date, series[24].d);
  assert.equal(byId['streak:30'].date, days[29].date);
  assert.ok(p.events.some(e => e.title === 'Perfect week'));
  assert.ok(!byId['days:75'], 'not reached yet');
  assert.deepEqual(p.upcoming.days, { target: 75, have: 50 });
  assert.deepEqual(p.upcoming.weights, { target: 50, have: 31 });
  // newest first
  for (let i = 1; i < p.events.length; i++) assert.ok(p.events[i - 1].date >= p.events[i].date);
});

test('progress: gaining works the same way, kilos use half-kilo steps, no goal means no milestones', () => {
  const up = smoothWeights(Array.from({ length: 20 }, (_, i) => ({ d: addDays(today, -40 + i * 2), kg: 70 + i * 0.15 })));
  const g = buildProgress({ days, series: up, goalKg: 75, today, calorieGoal: 2500, unit: 'kg' });
  assert.equal(g.direction, 'gain');
  assert.ok(g.events.some(e => e.id === 'milestone:gain:0.5'));
  assert.match(g.events.find(e => e.id === 'milestone:gain:0.5').title, /^Up 0\.5 kg$/);
  const none = buildProgress({ days, series, goalKg: null, today, calorieGoal: 2000 });
  assert.ok(!none.events.some(e => e.kind === 'milestone'));
  assert.equal(none.direction, null);
});

test('progress: reaching the goal is an event; an empty history is empty, not an error', () => {
  const done = smoothWeights(Array.from({ length: 20 }, (_, i) => ({ d: addDays(today, -40 + i * 2), kg: 80 - i * 1.0 })));
  const p = buildProgress({ days, series: done, goalKg: 70, today, calorieGoal: 2000 });
  assert.ok(p.events.some(e => e.id === 'goal-reached'));
  const e = buildProgress({ days: [], series: [], goalKg: 80, today });
  assert.equal(e.events.length, 0);
  assert.equal(e.streak.current, 0);
  assert.equal(e.start, null);
});

test('a start the user restarted from is used instead of the first weigh-in', () => {
  const p = buildProgress({ days, series, goalKg: 90, today, calorieGoal: 2000, unit: 'lb', start: { date: addDays(today, -20), kg: 97 } });
  assert.equal(p.start.kg, 97);
  assert.equal(p.events.find(e => e.id === 'plan-start').date, addDays(today, -20));
});

test('celebrations: the first run celebrates nothing; later runs only the new ones, oldest first', () => {
  const ev = [{ id: 'days:5', kind: 'achievement', date: '2026-10-01' }, { id: 'days:10', kind: 'achievement', date: '2026-10-06' }, { id: 'plan-start', kind: 'plan', date: '2026-09-01' }];
  const first = newEvents(ev, []);
  assert.deepEqual(first.fresh, []);
  assert.deepEqual(first.mark.sort(), ['days:10', 'days:5', 'plan-start']);
  const later = newEvents([...ev, { id: 'weights:5', kind: 'achievement', date: '2026-10-09' }, { id: 'days:25', kind: 'achievement', date: '2026-10-08' }], first.mark);
  assert.deepEqual(later.fresh.map(e => e.id), ['days:25', 'weights:5']);
  assert.deepEqual(newEvents(ev, first.mark).fresh, []);
});
