/** Wiring checks for the one-tap "+" rows and the goal-weight card (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Common and Recent rows share one self-styled row with a separate + button', () => {
  const row = read('src/components/foods/FoodQuickRow.svelte');
  assert.match(row, /list-style: none/);
  assert.match(row, /data-testid="quick-add"/);
  assert.match(row, /stopPropagation/);                 // + must not also open the row
  assert.match(row, /min-height: 60px/);
  assert.match(row, /width: 44px; height: 44px/);
  for (const f of ['CommonFoodResults', 'RecentFoods']) {
    const src = read(`src/components/foods/${f}.svelte`);
    assert.match(src, /FoodQuickRow/);
    assert.match(src, /dispatch\('add'/);
    assert.match(src, /dispatch\('pick'/);
  }
});

test('Common foods show 3 with Show more', () => {
  const src = read('src/components/foods/CommonFoodResults.svelte');
  assert.match(src, /initialCount = 3/);
  assert.match(src, /Show \$\{hidden\} more/);
});

test('Foods wires every list to quickAddFood, in both result modes', () => {
  const src = read('src/routes/Foods.svelte');
  assert.equal((src.match(/on:add=\{e => quickAddFood\(e\.detail\)\}/g) || []).length, 2);
  assert.equal((src.match(/on:add=\{e => quickAddFood\(e\.detail, 'common'\)\}/g) || []).length, 2);
  assert.match(src, /defaultMealForNow/);
});

test('Goals shows the goal-weight card and the server returns what it needs', () => {
  assert.match(read('src/routes/Goals.svelte'), /<GoalWeight \/>/);
  for (const p of ['server/lib/adaptive-tdee.js', 'src/lib/adaptive-tdee-local.js']) {
    const src = read(p);
    assert.equal((src.match(/\.\.\._extras/g) || []).length, 2);   // both the not-ready and ready returns
    assert.match(src, /trendWeightKg/);
    assert.match(src, /recentLoggedDays/);
  }
});
