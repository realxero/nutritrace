import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppleHealthPayload } from '../server/lib/apple-health.js';

const byKey = rows => Object.fromEntries(rows.map(r => [`${r.date}|${r.metric_type}`, r.value]));

test('Health Auto Export aggregated-by-day payload maps + converts units', () => {
  const { rows, format } = parseAppleHealthPayload({
    data: { metrics: [
      { name: 'step_count', units: 'count', data: [{ date: '2026-10-17 00:00:00 -0700', qty: 9876 }] },
      { name: 'walking_running_distance', units: 'mi', data: [{ date: '2026-10-17 00:00:00 -0700', qty: 4 }] },
      { name: 'active_energy', units: 'kJ', data: [{ date: '2026-10-17 00:00:00 -0700', qty: 2092 }] },
      { name: 'basal_energy_burned', units: 'kcal', data: [{ date: '2026-10-17 00:00:00 -0700', qty: 1700 }] },
      { name: 'weight_body_mass', units: 'lb', data: [{ date: '2026-10-17 07:00:00 -0700', qty: 180 }] },
      { name: 'blood_oxygen_saturation', units: '%', data: [{ date: '2026-10-17 00:00:00 -0700', qty: 0.97 }] },
      { name: 'heart_rate', units: 'count/min', data: [{ date: '2026-10-17 00:00:00 -0700', Min: 50, Avg: 72, Max: 161 }] },
      { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-10-17 00:00:00 -0700', qty: 57 }] },
      { name: 'sleep_analysis', units: 'hr', data: [{
        date: '2026-10-17 00:00:00 -0700', totalSleep: 7.5, core: 4, deep: 1.25, rem: 2.25, awake: 0.5,
        sleepStart: '2026-10-16 23:10:00 -0700', sleepEnd: '2026-10-17 07:05:00 -0700',
      }] },
    ] },
  });
  assert.equal(format, 'health-auto-export');
  const m = byKey(rows);
  assert.equal(m['2026-10-17|steps'], 9876);
  assert.equal(m['2026-10-17|distance_km'], 6.44);
  assert.equal(m['2026-10-17|active_calories'], 500);
  assert.equal(m['2026-10-17|calories_out'], 2200);
  assert.equal(m['2026-10-17|weight_kg'], 81.6);
  assert.equal(m['2026-10-17|spo2_avg'], 97);
  assert.equal(m['2026-10-17|avg_heart_rate'], 72);
  assert.equal(m['2026-10-17|max_hr'], 161);
  assert.equal(m['2026-10-17|resting_hr'], 57);
  assert.equal(m['2026-10-17|sleep_duration_min'], 450);
  assert.equal(m['2026-10-17|sleep_light_min'], 240);
  assert.equal(m['2026-10-17|sleep_deep_min'], 75);
  assert.equal(m['2026-10-17|sleep_start_min'], 23 * 60 + 10);
  assert.equal(m['2026-10-17|sleep_end_min'], 7 * 60 + 5);
});

test('raw samples roll up per day; raw sleep stages land on wake date', () => {
  const { rows } = parseAppleHealthPayload({
    data: { metrics: [
      { name: 'step_count', units: 'count', data: [
        { date: '2026-10-17 09:00:00 -0700', qty: 1000 },
        { date: '2026-10-17 12:00:00 -0700', qty: 2500 },
        { date: '2026-10-18 08:00:00 -0700', qty: 400 },
      ] },
      { name: 'sleep_analysis', units: 'hr', data: [
        { startDate: '2026-10-17 23:00:00 -0700', endDate: '2026-10-18 02:00:00 -0700', value: 'Core', qty: 3 },
        { startDate: '2026-10-18 02:00:00 -0700', endDate: '2026-10-18 03:00:00 -0700', value: 'Deep', qty: 1 },
        { startDate: '2026-10-18 03:00:00 -0700', endDate: '2026-10-18 05:00:00 -0700', value: 'REM', qty: 2 },
      ] },
    ] },
  });
  const m = byKey(rows);
  assert.equal(m['2026-10-17|steps'], 3500);
  assert.equal(m['2026-10-18|steps'], 400);
  assert.equal(m['2026-10-18|sleep_duration_min'], 360);
  assert.equal(m['2026-10-18|sleep_start_min'], 23 * 60);
});

test('simple Shortcuts format: whitelisted keys only, zero and junk dropped', () => {
  const { rows, dropped, format } = parseAppleHealthPayload({
    date: '2026-10-18', metrics: { steps: 8123, resting_hr: '58', evil: 5, active_minutes: 0, weight_kg: 9999 },
  });
  assert.equal(format, 'simple');
  const m = byKey(rows);
  assert.equal(m['2026-10-18|steps'], 8123);
  assert.equal(m['2026-10-18|resting_hr'], 58);
  assert.equal(m['2026-10-18|evil'], undefined);
  assert.equal(dropped.length, 2); // active_minutes=0, weight out of range
});

test('garbage body → no rows', () => {
  assert.deepEqual(parseAppleHealthPayload(null).rows, []);
  assert.deepEqual(parseAppleHealthPayload({ foo: 1 }).rows, []);
});
