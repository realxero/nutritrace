/**
 * patterns.js — "what I've noticed" from the diary (fork). Pure.
 *
 * Looks for habits that go with eating less or more over a day:
 *   food      "On days you have X, the rest of your day is about N kcal lighter / heavier"
 *   over      "Days with X end over your calorie goal 71% of the time, vs 22% otherwise"
 *   breakfast "On days with 20+ g protein at breakfast, you eat about N kcal less later"
 *   weekday   "You tend to eat about N kcal more on Saturdays"
 *
 * A pattern is only reported when there are enough days on both sides, the difference is
 * big enough to matter AND clears a plain significance test (Welch's t for averages, a
 * two-proportion z for "over the goal"), so noise does not become advice. Even then it is
 * a correlation: the wording says "tends to", shows how many days it rests on, and never
 * says the food causes anything.
 */
import { itemTotals } from './suggestions.js';

const MIN_DAYS_EACH_SIDE = 6;
const MIN_WEEKDAY_DAYS = 4;
const T_MIN = 2.0;
const Z_MIN = 2.0;
const MAX_FOOD_SHARE = 0.75;           // a food on almost every day says nothing about the days it is missing
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const variance = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1); };

/** Welch's t statistic for the difference of two means (b − a is not assumed; returns signed mean(a) − mean(b)). */
export function welchT(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  return se > 0 ? (mean(a) - mean(b)) / se : 0;
}

/** Two-proportion z statistic (hits1/n1 vs hits2/n2). */
export function propZ(h1, n1, h2, n2) {
  const p = (h1 + h2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (h1 / n1 - h2 / n2) / se : 0;
}

const dayOfWeek = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, 12).getDay(); };
const key = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const r0 = (n) => Math.round(n);

/**
 * @param {object} p
 * @param {Array<{date:string, items:Array}>} p.days  diary days (items as logged)
 * @param {number|null} p.calorieGoal
 * @param {number} p.limit   how many patterns to return
 */
export const WEEKDAY_NAMES = WEEKDAYS;

export function findPatterns({ days = [], calorieGoal = null, limit = 5 } = {}) {
  const minCal = Math.max(800, calorieGoal ? calorieGoal * 0.5 : 0);        // a half-logged day would fake a "light" day
  const complete = [];
  for (const d of days) {
    const items = (d.items || []).filter(i => i && i.type !== 'quick_calories' || (i && i.nutrition));
    const rows = items.map(i => ({ name: i.type === 'quick_calories' ? '' : key(i.name), kcal: itemTotals(i).calories, protein: itemTotals(i).proteins, meal: Number(i.meal) || 0 }));
    const total = rows.reduce((a, r) => a + r.kcal, 0);
    if (rows.length && total >= minCal) complete.push({ date: d.date, rows, total });
  }
  const N = complete.length;
  const out = [];
  if (N < MIN_DAYS_EACH_SIDE * 2) return { patterns: [], daysUsed: N };

  const thresholdKcal = Math.max(120, calorieGoal ? calorieGoal * 0.07 : 0);
  const mk = (kind, t, o) => ({ kind, strength: Math.abs(t) >= 3 ? 'strong' : 'hint', ...o });

  // ── foods ────────────────────────────────────────────────────────────
  const foodDays = new Map();                         // name → Set(date)
  for (const d of complete) for (const r of d.rows) { if (!r.name) continue; if (!foodDays.has(r.name)) foodDays.set(r.name, new Set()); foodDays.get(r.name).add(d.date); }
  for (const [name, set] of foodDays) {
    if (set.size < MIN_DAYS_EACH_SIDE || set.size > N * MAX_FOOD_SHARE || N - set.size < MIN_DAYS_EACH_SIDE) continue;
    const withD = complete.filter(d => set.has(d.date)), withoutD = complete.filter(d => !set.has(d.date));
    // the rest of the day, so the food's own calories do not decide the answer
    const restWith = withD.map(d => d.total - d.rows.filter(r => r.name === name).reduce((a, r) => a + r.kcal, 0));
    const restWithout = withoutD.map(d => d.total);
    const diff = mean(restWith) - mean(restWithout), t = welchT(restWith, restWithout);
    if (Math.abs(diff) >= thresholdKcal && Math.abs(t) >= T_MIN) {
      out.push(mk(diff < 0 ? 'eat-less' : 'eat-more', t, {
        food: name, n: withD.length, nOther: withoutD.length, deltaKcal: r0(Math.abs(diff)), score: Math.abs(diff) / (calorieGoal || 2000),
        text: `On days you have ${name}, you tend to eat about ${r0(Math.abs(diff)).toLocaleString()} kcal ${diff < 0 ? 'less' : 'more'} for the rest of the day.`,
      }));
    }
    if (calorieGoal > 0) {
      const over = (d) => d.total > calorieGoal * 1.05;
      const h1 = withD.filter(over).length, h2 = withoutD.filter(over).length;
      const p1 = h1 / withD.length, p2 = h2 / withoutD.length, z = propZ(h1, withD.length, h2, withoutD.length);
      if (p1 - p2 >= 0.25 && z >= Z_MIN) {
        out.push(mk('over', z, {
          food: name, n: withD.length, nOther: withoutD.length, withOver: r0(p1 * 100), withoutOver: r0(p2 * 100), score: (p1 - p2) * 0.8,
          text: `Days with ${name} end over your calorie goal ${r0(p1 * 100)}% of the time, compared with ${r0(p2 * 100)}% of other days.`,
        }));
      }
    }
  }

  // ── breakfast protein ────────────────────────────────────────────────
  const bf = complete.filter(d => d.rows.some(r => r.meal === 0));
  const hi = bf.filter(d => d.rows.filter(r => r.meal === 0).reduce((a, r) => a + r.protein, 0) >= 20);
  const lo = bf.filter(d => !hi.includes(d));
  if (hi.length >= MIN_DAYS_EACH_SIDE && lo.length >= MIN_DAYS_EACH_SIDE) {
    const later = (d) => d.total - d.rows.filter(r => r.meal === 0).reduce((a, r) => a + r.kcal, 0);
    const a = hi.map(later), b = lo.map(later);
    const diff = mean(a) - mean(b), t = welchT(a, b);
    if (Math.abs(diff) >= thresholdKcal && Math.abs(t) >= T_MIN) {
      out.push(mk(diff < 0 ? 'breakfast-less' : 'breakfast-more', t, {
        n: hi.length, nOther: lo.length, deltaKcal: r0(Math.abs(diff)), score: Math.abs(diff) / (calorieGoal || 2000),
        text: `On days with 20 g or more of protein at breakfast, you tend to eat about ${r0(Math.abs(diff)).toLocaleString()} kcal ${diff < 0 ? 'less' : 'more'} later in the day.`,
      }));
    }
  }

  // ── weekday ──────────────────────────────────────────────────────────
  for (let wd = 0; wd < 7; wd++) {
    const on = complete.filter(d => dayOfWeek(d.date) === wd), off = complete.filter(d => dayOfWeek(d.date) !== wd);
    if (on.length < MIN_WEEKDAY_DAYS || off.length < MIN_DAYS_EACH_SIDE) continue;
    const a = on.map(d => d.total), b = off.map(d => d.total);
    const diff = mean(a) - mean(b), t = welchT(a, b);
    if (Math.abs(diff) >= Math.max(150, thresholdKcal) && Math.abs(t) >= T_MIN) {
      out.push(mk('weekday', t, {
        weekday: wd, dir: diff < 0 ? 'less' : 'more', n: on.length, nOther: off.length, deltaKcal: r0(Math.abs(diff)), score: Math.abs(diff) / (calorieGoal || 2000),
        text: `You tend to eat about ${r0(Math.abs(diff)).toLocaleString()} kcal ${diff < 0 ? 'less' : 'more'} on ${WEEKDAYS[wd]} than on other days.`,
      }));
    }
  }

  out.sort((x, y) => y.score - x.score);
  return { patterns: out.slice(0, limit), daysUsed: N };
}
