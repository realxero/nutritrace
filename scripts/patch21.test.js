/** Undo toasts, nutrient watch wiring and the trend chart wiring (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { toasts, showUndo, dismissToast, showToast } from '../src/stores/toast.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('showUndo makes a success toast carrying an Undo action, and it can be dismissed', async () => {
  let undone = 0;
  showUndo('Swapped to Zero-sugar soda', () => { undone++; }, 50);
  const t = get(toasts).find(x => x.message === 'Swapped to Zero-sugar soda');
  assert.ok(t);
  assert.equal(t.type, 'success');
  assert.equal(t.action.label, 'Undo');
  await t.action.onClick();
  assert.equal(undone, 1);
  dismissToast(t.id);
  assert.ok(!get(toasts).some(x => x.id === t.id));
  // ordinary toasts have no action
  showToast('plain', 10);
  assert.equal(get(toasts).find(x => x.message === 'plain').action, null);
});

test('Undo is wired for quick-add, ideas and swaps, and removes by uuid', () => {
  assert.match(read('src/routes/Foods.svelte'), /showUndo\(\$_\('foods\.detail\.added_to'/);
  assert.match(read('src/routes/Foods.svelte'), /removeDiaryItemByUuid\(_landsOn, _added\?\.uuid\)/);
  const c = read('src/components/diary/SuggestionsCard.svelte');
  assert.match(c, /showUndo\(`Swapped to/);
  assert.match(c, /showUndo\(`Added /);
  const b = read('src/components/diary/BetterOptionSheet.svelte');
  assert.match(b, /undoSwap\(date, original, added\)/);
  const st = read('src/stores/diary.js');
  assert.match(st, /export async function removeDiaryItemByUuid/);
  assert.match(st, /return item; \/\/ fork/);
  // a restored item gets a new uuid so an already-synced delete cannot take it with it
  assert.match(st, /uuid: _newUuid\(\) \}/);
  assert.match(read('src/components/ui/Toast.svelte'), /pointer-events: auto/);   // the container ignores taps; the button must not
});

test('nutrient watch: card rows, Diary limits, settings, sheet focus', () => {
  const c = read('src/components/diary/SuggestionsCard.svelte');
  assert.match(c, /buildDaySuggestions/);
  assert.match(c, /data-testid="suggestion-nutrient"/);
  assert.match(c, /limits,/);
  const d = read('src/routes/Diary.svelte');
  assert.match(d, /limits=\{nutrientLimits\}/);
  assert.match(d, /id !== 'fiber' && g\.isMin/);       // a "minimum" goal is never treated as a limit
  const ui = read('src/routes/settings/Diary.svelte');
  assert.match(ui, /data-testid="watched-nutrients"/);
  const st = read('src/stores/settings.js');
  for (const k of ['suggestNutrients', 'watchedNutrients']) assert.match(st, new RegExp(`'${k}'`));
  const sheet = read('src/components/diary/BetterOptionSheet.svelte');
  for (const f of ["'sodium'", "'fat'", "'saturated-fat'", "'fiber'"]) assert.ok(sheet.includes(f), `${f} chip`);
});

test('the weekly trend chart is fed by the adaptive response on both server and Android', () => {
  for (const p of ['server/lib/adaptive-tdee.js', 'src/lib/adaptive-tdee-local.js']) {
    const s = read(p);
    assert.match(s, /weightSeries/);
    assert.equal((s.match(/\.\.\._extras/g) || []).length, 2);
  }
  assert.match(read('src/components/diary/GoalWeight.svelte'), /<WeightTrendChart series=\{adaptive\.weightSeries\}/);
});
