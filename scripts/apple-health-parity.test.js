// Fork: Apple Health rows must show wherever Fitbit/Health Connect rows do —
// on the server AND in the phone's offline copy (api-native.js). The iOS app
// synced 197 rows that never appeared because only the server knew about them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const native = readFileSync(new URL('../src/lib/api-native.js', import.meta.url), 'utf8');

test("phone-side Wellness reads apple_health rows", () => {
  assert.match(native, /\/api\/wellness\/fitbit\/data'\)\)\s*return _wellnessDataLocal\(path, \[[^\]]*'apple_health'/);
});

test("phone-side calories-out considers apple_health", () => {
  assert.match(native, /const PRIORITY = \[[^\]]*'apple_health'/);
});

test("phone-side ordering matches the server (apple_health last)", () => {
  const orders = native.match(/CASE source WHEN 'health_connect' THEN 2.*? END/g) || [];
  assert.ok(orders.length >= 2);
  for (const o of orders) assert.match(o, /'apple_health' THEN 3/);
});

test("app's today view (Wellness) loads apple_health rows", () => {
  const w = readFileSync(new URL('../src/routes/Wellness.svelte', import.meta.url), 'utf8');
  assert.match(w, /dbGetWellnessGrouped\(dateStr, dateStr, 'apple_health'\)/);
});

test("phone-side adaptive TDEE considers apple_health like the server", () => {
  const t = readFileSync(new URL('../src/lib/adaptive-tdee-local.js', import.meta.url), 'utf8');
  assert.match(t, /PRIORITY = \[[^\]]*'apple_health'/);
});
