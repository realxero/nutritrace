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
