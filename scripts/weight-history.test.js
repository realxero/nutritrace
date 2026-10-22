import assert from 'node:assert/strict';
import test from 'node:test';
import { smoothWeights, lastDays, spanDays } from '../src/lib/weight-history.js';

test('smoothing: first reading is itself, later ones move part of the way', () => {
  const s = smoothWeights([{ d: '2026-10-01', kg: 90 }, { d: '2026-10-02', kg: 91 }, { d: '2026-10-03', kg: 90 }]);
  assert.equal(s[0].t, 90);
  assert.ok(s[1].t > 90 && s[1].t < 91, 'a one-day spike only nudges the trend');
  assert.ok(s[1].t < 90.2);
  assert.ok(s.every(p => p.m === true));
});

test('a longer gap between readings counts for more than a single day', () => {
  const near = smoothWeights([{ d: '2026-10-01', kg: 90 }, { d: '2026-10-02', kg: 86 }]);
  const far = smoothWeights([{ d: '2026-10-01', kg: 90 }, { d: '2026-10-15', kg: 86 }]);
  assert.ok(far[1].t < near[1].t, 'after two weeks the trend has moved further toward 86');
});

test('a steady loss shows up as a falling trend', () => {
  const w = Array.from({ length: 60 }, (_, i) => ({ d: `2026-${i < 30 ? '09' : '10'}-${String((i % 30) + 1).padStart(2, '0')}`, kg: 100 - i * 0.1 + (i % 2 ? 0.5 : -0.5) }));
  const s = smoothWeights(w);
  assert.ok(s[59].t < s[0].t - 4);
  for (let i = 10; i < 59; i++) assert.ok(s[i + 1].t <= s[i].t + 0.35, 'no big upward jumps in the trend');
});

test('bad rows are skipped and order does not matter', () => {
  const s = smoothWeights([{ d: '2026-10-03', kg: 90 }, { d: '', kg: 80 }, { d: '2026-10-01', kg: 0 }, { d: '2026-10-02', kg: 91 }, null]);
  assert.deepEqual(s.map(p => p.d), ['2026-10-02', '2026-10-03']);
  assert.deepEqual(smoothWeights(null), []);
});

test('range helpers', () => {
  const s = smoothWeights([{ d: '2026-06-01', kg: 95 }, { d: '2026-09-01', kg: 92 }, { d: '2026-10-20', kg: 90 }]);
  assert.equal(lastDays(s, 92, '2026-10-22').length, 2);
  assert.equal(spanDays(s), 141);
  assert.equal(spanDays([]), 0);
});
