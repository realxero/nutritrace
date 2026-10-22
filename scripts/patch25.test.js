/** Wiring for patch 25: week day picking, Diary heads-ups, monthly recap, Diary celebrations (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the week planner plans only the days picked, with presets, and remembers the weekdays', () => {
  const w = read('src/components/diary/WeekPlanSheet.svelte');
  assert.match(w, /data-testid="week-days"/);
  assert.match(w, /candidates\.filter\(c => picked\.has\(c\.date\)\)/);
  for (const p of ["preset('all')", "preset('weekdays')", "preset('weekends')", "preset('none')"]) assert.ok(w.includes(p), p);
  assert.match(w, /weekPlanDays\.set\(/);
  assert.match(w, /\$weekPlanDays/);
  // picking days re-plans; it does not re-read the diary
  assert.match(w, /function replan\(\)/);
  assert.match(read('src/stores/settings.js'), /createSettingStore\('weekPlanDays', \[0, 1, 2, 3, 4, 5, 6\]\)/);
});

test('Diary heads-up: built from the cached history, gated by the patterns and suggestions switches, hideable, offers a plan', () => {
  const c = read('src/components/diary/SuggestionsCard.svelte');
  assert.match(c, /data-testid="suggestion-nudge"/);
  assert.match(c, /getProgressData\(\)/);
  assert.match(c, /\$smartSuggestions && \$showPatterns/);
  assert.match(c, /findNudges\(\{ patterns, items, date, today, kcalLeft, completed, dismissed: dismissedToday \}\)/);
  assert.match(c, /dispatch\('plan'\)/);
  assert.match(c, /aria-label="Hide this heads-up"/);
  // the pattern search does not re-run on every small goal change
  assert.match(c, /Math\.round\(calorieGoal \/ 50\) \* 50/);
});

test('every screen shares one cached copy of the history', () => {
  const d = read('src/lib/progress-data.js');
  assert.match(d, /export async function getProgressData/);
  assert.match(d, /TTL_MS/);
  for (const f of ['ProgressCard', 'PatternsCard', 'RecapCard', 'CelebrationBanner', 'SuggestionsCard']) {
    const src = read(`src/components/diary/${f}.svelte`);
    assert.match(src, /getProgressData/, f);
    assert.doesNotMatch(src, /loadProgressData\(/, `${f} should use the cached copy`);
  }
});

test('monthly recap: on Goals, switchable, dismissible per month, shareable', () => {
  assert.match(read('src/routes/Goals.svelte'), /<RecapCard \/>/);
  const r = read('src/components/diary/RecapCard.svelte');
  assert.match(r, /\$recapSeen !== month/);
  assert.match(r, /recapSeen\.set\(month\)/);
  assert.match(r, /data-testid="recap-share"/);
  const st = read('src/stores/settings.js');
  for (const k of ['showRecap', 'recapSeen', 'weekPlanDays']) assert.match(st, new RegExp(`'${k}'`));
  assert.match(read('src/routes/settings/Goals.svelte'), /Monthly recap/);
});

test('Diary celebration banner: shown once, shares the "already celebrated" list with Goals, off with the progress switch', () => {
  const b = read('src/components/diary/CelebrationBanner.svelte');
  assert.match(b, /data-testid="diary-celebration"/);
  assert.match(b, /newEvents\(progress\.events, \$celebratedEvents\)/);
  assert.match(b, /\$showProgress/);
  assert.match(read('src/routes/Diary.svelte'), /<CelebrationBanner \/>/);
});
