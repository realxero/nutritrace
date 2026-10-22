/** Calendar marks for completed vs logged-but-open days (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { calendarMarks } from '../src/lib/calendar-marks.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('closed-out days and logged-but-open days are separate; completed wins; empty days get nothing', () => {
  const m = calendarMarks([
    { date: '2026-10-06', completed_at: '2026-10-06T11:04:00Z', items: [{ name: 'a' }] },
    { date: '2026-10-07', items: [{ name: 'b' }] },
    { date: '2026-10-08', items: [] },
    { date: '2026-10-09', completed_at: '2026-10-09T20:00:00Z', items: [] },
    { date: '2026-10-10' },
    { items: [{ name: 'x' }] },
    null,
  ]);
  assert.deepEqual([...m.completed].sort(), ['2026-10-06', '2026-10-09']);
  assert.deepEqual([...m.logged], ['2026-10-07']);
  assert.ok(![...m.logged].some(d => m.completed.has(d)), 'a day is never both');
});

test('bad input gives empty sets, not an error', () => {
  for (const bad of [null, undefined, {}, 'x']) {
    const m = calendarMarks(bad);
    assert.equal(m.completed.size, 0);
    assert.equal(m.logged.size, 0);
  }
});

test('the date picker draws a ring for logged days, only where the caller opts in, and explains both marks', () => {
  const dp = read('src/components/ui/DatePicker.svelte');
  assert.match(dp, /export let loggedDays = null/);
  assert.match(dp, /class:dp-logged=\{loggedDays && loggedDays\.has && loggedDays\.has\(ds\) && !\(completedDays && completedDays\.has && completedDays\.has\(ds\)\)\}/);
  assert.match(dp, /\.dp-day\.dp-logged::after/);
  assert.match(dp, /data-testid="dp-legend"/);
  const d = read('src/routes/Diary.svelte');
  assert.match(d, /calendarMarks\(all\)/);
  assert.match(d, /completedDays=\{pickerCompletedDays\} loggedDays=\{pickerLoggedDays\}/);
  // completion off: closed-out days still show, as rings, rather than disappearing
  assert.match(d, /pickerLoggedDays = new Set\(\[\.\.\.m\.logged, \.\.\.m\.completed\]\)/);
  // the calendar no longer skips the read when day-completion is off: logged days are useful on their own
  assert.doesNotMatch(d, /if \(\$diaryShowCompletion\) _refreshPickerCompletedDays\(\)/);
});
