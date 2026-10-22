/** The monkey test excuses only a navigation, never a crash or an app error (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const spec = readFileSync(new URL('../e2e/tests/monkey.spec.js', import.meta.url), 'utf8');

test('a page navigation during the horde is excused and noted, nothing else is', () => {
  assert.match(spec, /\/Execution context was destroyed\/\.test\(String\(e && e\.message\)\)\) throw e;/);
  assert.match(spec, /annotations\.push\(\{ type: 'note'/);
  const guard = spec.split('\n').find(l => l.includes('Execution context was destroyed/.test'));
  assert.ok(guard && !/Target|closed|crash/i.test(guard), 'only a navigation is excused: a closed or crashed page is not');
});

test('the app-error check and the "still usable afterwards" check are still there', () => {
  assert.match(spec, /errors\.filter\(e => e\.startsWith\('pageerror'\)\), 'uncaught errors during monkey run'/);
  assert.match(spec, /await page\.goto\('\/#\/'\);\s*\n\s*await expect\(page\.locator\('\.meal-photo-btn'\)\.first\(\)\)\.toBeVisible/);
});
