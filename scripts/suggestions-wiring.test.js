/** Wiring checks for Smart Suggestions (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the Diary mounts the card with the day, goals and completion', () => {
  const src = read('src/routes/Diary.svelte');
  assert.match(src, /<SuggestionsCard date=\{\$currentDate\}/);
  assert.match(src, /proteinGoal=\{protGoal\}/);
  assert.match(src, /completed=\{_dayIsComplete\}/);
});

test('settings: a master switch and one per kind, all synced preferences, default on', () => {
  const st = read('src/stores/settings.js');
  for (const k of ['smartSuggestions', 'suggestSwaps', 'suggestProtein', 'dismissedSuggestions']) {
    assert.match(st, new RegExp(`'${k}'`));
  }
  assert.match(st, /createSettingStore\('smartSuggestions',\s+true\)/);
  const ui = read('src/routes/settings/Diary.svelte');
  assert.match(ui, /data-testid="settings-suggestions"/);
  assert.match(ui, /disabled=\{!\$smartSuggestions\}/);       // sub-switches follow the master
});

test('the card turns off with the master switch and acts only on a button press', () => {
  const c = read('src/components/diary/SuggestionsCard.svelte');
  assert.match(c, /\$smartSuggestions\s*\n?\s*\? suggestForDay/);
  assert.match(c, /on:click=\{\(\) => swap\(sw\)\}/);
  assert.match(c, /on:click=\{\(\) => addIdea\(idea\)\}/);
  assert.match(c, /Hide this suggestion/);
  // a swap adds the new food first and removes the original by uuid, never by a stale index
  assert.ok(c.indexOf('await addDiaryItem') < c.indexOf('await removeDiaryItem'));
  assert.match(c, /i\.uuid === sw\.from\.uuid/);
});

test('the weekly check-in adjustment follows the same switch', () => {
  const w = read('src/components/diary/WeeklyCheckIn.svelte');
  assert.match(w, /\$smartSuggestions && \$targetWeightKg && \$targetWeightDate/);
  assert.match(w, /data-testid="weekly-adjustment"/);
});
