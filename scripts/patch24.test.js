/** Wiring for patch 24: brand-aware planning, better dislikes, allergen tag, week plan, history, progress, patterns (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the day planner loads saved foods, meals and recipes, and shows brands and "yours"', () => {
  const p = read('src/components/diary/DayPlanSheet.svelte');
  assert.match(p, /NtApi\.getMeals\(\)/);
  assert.match(p, /NtApi\.getRecipes\(\)/);
  assert.match(p, /dishFromMeal/);
  assert.match(p, /saved, dishes/);
  assert.match(p, /class="dp-yours"/);
  assert.match(p, /data-testid="plan-week-open"/);
});

test('the week planner: next 7 days, per-day goals, undoable, one shopping list', () => {
  const w = read('src/components/diary/WeekPlanSheet.svelte');
  assert.match(w, /for \(let o = 1; o <= 7; o\+\+\)/);
  assert.match(w, /resolveGoalFor/);
  assert.match(w, /g\.isPercent/);                                   // a percent goal is never read as grams
  assert.match(w, /showUndo\(`Added \$\{usable\.length\} planned day/);
  assert.match(w, /data-testid="week-to-list"/);
  assert.match(w, /hasItems:/);                                      // meals that already have food are left alone
});

test('settings: common-dislike chips and the "test a food" box', () => {
  const s = read('src/routes/settings/Foods.svelte');
  assert.match(s, /data-testid="food-test"/);
  assert.match(s, /explainFood\(testText, \$foodPrefs\)/);
  assert.match(s, /COMMON_DISLIKES/);
});

test('Diary: an amber "may contain" tag on logged foods, only when allergies are set, worded as name-based', () => {
  const d = read('src/routes/Diary.svelte');
  assert.match(d, /data-testid="allergen-tag"/);
  assert.match(d, /may contain/);
  assert.match(d, /\$foodAllergens, \$foodAvoid/);
  assert.match(d, /title="Based on the food's name only\. Check the label\."/);
  assert.match(d, /\(allergens \|\| \[\]\)\.length && !\(avoid \|\| \[\]\)\.length|!\(allergens \|\| \[\]\)\.length && !\(avoid \|\| \[\]\)\.length/);
});

test('weekly check-in shows sodium and fiber', () => {
  const w = read('src/components/diary/WeeklyCheckIn.svelte');
  assert.match(w, /data-testid="weekly-nutrients"/);
  assert.match(w, /summarizeNutrients/);
});

test('weight history: endpoint on the server, a local mirror, routing in both API layers, and the chart ranges', () => {
  assert.match(read('server/index.js'), /router\.get\('\/api\/goals\/weight-history'/);
  assert.match(read('server/lib/adaptive-tdee.js'), /export function getWeightHistory/);
  assert.match(read('src/lib/adaptive-tdee-local.js'), /export async function computeWeightHistoryLocal/);
  assert.match(read('src/lib/api-cached.js'), /weight-history/);
  assert.match(read('src/lib/api-native.js'), /weight-history/);
  const c = read('src/components/diary/WeightTrendChart.svelte');
  for (const label of ['5 wks', '3 mo', 'All']) assert.ok(c.includes(label), label);
  assert.match(read('src/components/diary/GoalWeight.svelte'), /weight-history\?days=3650/);
});

test('the server file stays self-contained (the Docker image copies no extra src files for it)', () => {
  assert.doesNotMatch(read('server/lib/adaptive-tdee.js'), /from ['"]\.\.\/\.\.\/src\//);
  assert.doesNotMatch(read('server/index.js').split("weight-history")[1].slice(0, 400), /src\/lib/);
});

test('progress and patterns are on the Goals page and switchable in Settings', () => {
  const g = read('src/routes/Goals.svelte');
  assert.match(g, /<ProgressCard \/>/);
  assert.match(g, /<PatternsCard \/>/);
  const st = read('src/stores/settings.js');
  for (const k of ['showProgress', 'showPatterns', 'planStart', 'celebratedEvents']) assert.match(st, new RegExp(`'${k}'`));
  const ui = read('src/routes/settings/Goals.svelte');
  assert.match(ui, /data-testid="settings-progress"/);
  const pc = read('src/components/diary/ProgressCard.svelte');
  assert.match(pc, /data-testid="celebration"/);
  assert.match(pc, /newEvents\(progress\.events, \$celebratedEvents\)/);
  assert.match(pc, /data-testid="open-timeline"/);
  assert.match(read('src/components/diary/TimelineSheet.svelte'), /data-testid="timeline-restart"/);
  assert.match(read('src/components/diary/TimelineSheet.svelte'), /showUndo\('Started a new plan from today'/);
  // patterns follow the Smart Suggestions master switch
  assert.match(read('src/components/diary/PatternsCard.svelte'), /\$showPatterns && \$smartSuggestions/);
});

test('patterns say "tend to", show how many days, and never claim a cause', () => {
  const p = read('src/lib/patterns.js');
  assert.match(p, /tend to/);
  const c = read('src/components/diary/PatternsCard.svelte');
  assert.match(c, /not proof that one thing causes another/);
  assert.match(c, /Based on \{p\.n\} days with it and \{p\.nOther\} without/);
});
