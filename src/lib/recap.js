/**
 * recap.js — the monthly recap (fork). Pure.
 *
 * "October: you logged 24 of 31 days and your weight trended down 2.1 lb, about the weight
 * of a pineapple." A short, kind summary of a finished month: days logged, how often you
 * landed within your calorie goal, average calories and protein, the weight trend, your best
 * streak and what you earned. Needs at least 8 logged days; a month that went the wrong way
 * is described plainly, never scolded.
 */
import { daysBetween, addDays } from './goal-projection.js';
import { weightPhrase } from './weight-compare.js';

const LB = 2.20462;
const MIN_LOGGED = 8;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM' of the month before `today`. */
export function previousMonth(today) {
  let [y, m] = today.split('-').map(Number);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
const daysIn = (month) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthLabel = (month) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

function longestRun(dates) {
  const sorted = [...new Set(dates)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) { run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1; if (run > best) best = run; prev = d; }
  return best;
}

/**
 * @param {object} p
 * @param {Array<{date,calories,protein,logged}>} p.days   every diary day
 * @param {Array<{d,t}>} p.series     smoothed weigh-ins
 * @param {Array<{id,kind,title,date}>} p.events  from buildProgress
 * @param {number|null} p.calorieGoal
 * @param {string} p.month  'YYYY-MM'
 * @param {'lb'|'kg'} p.unit
 * @returns {object|null}  null when there is not enough to say
 */
export function buildRecap({ days = [], series = [], events = [], calorieGoal = null, month, unit = 'lb' } = {}) {
  const inMonth = (d) => d.slice(0, 7) === month;
  const logged = days.filter(d => d.logged && inMonth(d.date));
  if (logged.length < MIN_LOGGED) return null;
  const dim = daysIn(month);
  const first = `${month}-01`, last = `${month}-${String(dim).padStart(2, '0')}`;

  const avg = (k) => Math.round(logged.reduce((a, d) => a + (Number(d[k]) || 0), 0) / logged.length);
  const complete = calorieGoal > 0 ? logged.filter(d => d.calories >= calorieGoal * 0.6) : [];
  const within = calorieGoal > 0 ? complete.filter(d => d.calories <= calorieGoal * 1.05).length : null;

  // Weight: the smoothed value going into the month vs coming out of it.
  const before = [...series].filter(p => p.d < first).pop();
  const inside = series.filter(p => p.d >= first && p.d <= last);
  const startP = before || inside[0], endP = inside[inside.length - 1];
  let changeKg = null;
  if (startP && endP && startP !== endP && inside.length >= 1) changeKg = Math.round((endP.t - startP.t) * 100) / 100;
  const shown = changeKg == null ? null : Math.round(Math.abs(unit === 'lb' ? changeKg * LB : changeKg) * 10) / 10;

  const earned = events.filter(e => e.kind !== 'plan' && inMonth(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const perfect = earned.filter(e => e.id.startsWith('perfect:')).length;

  const parts = [`You logged ${logged.length} of ${dim} days`];
  let weightText = '';
  if (changeKg != null && Math.abs(changeKg) >= 0.1 && shown >= 0.1) {
    const ph = weightPhrase(Math.abs(changeKg));
    weightText = `${changeKg < 0 ? 'down' : 'up'} ${shown} ${unit}${ph ? `, ${ph}` : ''}`;
    parts.push(`and your weight trended ${weightText}`);
  } else if (changeKg != null) parts.push('and your weight held steady');
  let headline = parts.join(' ') + '.';
  if (within != null && complete.length >= 5) headline += ` On ${within} of your ${complete.length} fully logged days you finished within your calorie goal.`;

  return {
    month, label: monthLabel(month), daysInMonth: dim, daysLogged: logged.length,
    avgCalories: avg('calories'), avgProtein: avg('protein'), calorieGoal: calorieGoal > 0 ? calorieGoal : null,
    withinGoal: within, fullyLogged: complete.length,
    changeKg, changeShown: shown, weightText, direction: changeKg == null || Math.abs(changeKg) < 0.1 ? null : changeKg < 0 ? 'down' : 'up',
    longestStreak: longestRun(logged.map(d => d.date)), perfectWeeks: perfect, earned: earned.map(e => ({ id: e.id, title: e.title, phrase: e.phrase || '', date: e.date })),
    headline,
  };
}

/** Plain text for sharing or saving. */
export function recapText(r) {
  if (!r) return '';
  const lines = [`${r.label} recap`, r.headline, ''];
  lines.push(`Days logged: ${r.daysLogged} of ${r.daysInMonth}`);
  lines.push(`Average: ${r.avgCalories.toLocaleString()} kcal${r.calorieGoal ? ` (goal ${r.calorieGoal.toLocaleString()})` : ''}, ${r.avgProtein} g protein`);
  if (r.longestStreak > 1) lines.push(`Longest streak: ${r.longestStreak} days`);
  if (r.perfectWeeks) lines.push(`Perfect weeks: ${r.perfectWeeks}`);
  for (const e of r.earned.slice(0, 6)) lines.push(`- ${e.title}${e.phrase ? ` (${e.phrase})` : ''}`);
  return lines.join('\n');
}
