/** Wiring checks for strictness, never-suggest, on-demand better option and Trace (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('settings: level and never-suggest list are synced preferences with safe defaults', () => {
  const st = read('src/stores/settings.js');
  for (const k of ['suggestionLevel', 'mutedSuggestionFoods']) assert.match(st, new RegExp(`'${k}'`));
  assert.match(st, /createSettingStore\('suggestionLevel',\s+'balanced'\)/);
  assert.match(st, /createSettingStore\('mutedSuggestionFoods',\s+\[\]\)/);
  const ui = read('src/routes/settings/Diary.svelte');
  assert.match(ui, /data-testid="suggestion-level"/);
  assert.match(ui, /data-testid="muted-foods"/);
  assert.match(ui, /disabled=\{!\$smartSuggestions\}/);
});

test('the card uses the level and the never-suggest list, and the X offers hide or never', () => {
  const c = read('src/components/diary/SuggestionsCard.svelte');
  assert.match(c, /level: \$suggestionLevel, muted: \$mutedSuggestionFoods/);
  assert.match(c, /Never suggest changes for/);
  assert.match(c, /Hide for today/);
  assert.match(c, /swapDiaryItem/);
});

test('swaps add the new food first and remove the original by id, never a stale index', () => {
  const a = read('src/lib/suggestion-actions.js');
  assert.ok(a.indexOf('await addSuggestedFood') < a.indexOf('await removeDiaryItem'));
  assert.match(a, /i\.uuid === from\.uuid/);
});

test('Better option is reachable from the long-press menu and the edit sheet, switch on or off', () => {
  const d = read('src/routes/Diary.svelte');
  assert.match(d, /value: 'better'/);
  assert.match(d, /data-testid="edit-better-btn"/);
  assert.match(d, /<BetterOptionSheet bind:open=\{showBetter\}/);
  // not gated on the Smart Suggestions switch
  const sheet = read('src/components/diary/BetterOptionSheet.svelte');
  assert.doesNotMatch(sheet, /\$smartSuggestions/);
  assert.match(sheet, /data-testid="never-for-food"/);
});

test('AI alternatives only run on a button press and are labelled honestly', () => {
  const sheet = read('src/components/diary/BetterOptionSheet.svelte');
  assert.match(sheet, /on:click=\{findReal\}/);
  assert.equal((sheet.match(/askForAlternatives\(/g) || []).length, 1);     // called from findReal only
  assert.match(sheet, /Checked online/);
  assert.match(sheet, /Estimate · check the label/);
  assert.match(sheet, /\$aiEffectivelyEnabled/);
});

test('Trace listens for ask-trace and never routes it to multi-food logging', () => {
  const t = read('src/components/ai/Trace.svelte');
  assert.match(t, /addEventListener\('nt:ask-trace'/);
  assert.match(t, /removeEventListener\('nt:ask-trace'/);
  assert.match(t, /!_forceChat && _looksLikeMultiFoodLog/);
});
