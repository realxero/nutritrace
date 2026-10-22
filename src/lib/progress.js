/**
 * progress.js — streaks, milestones and achievements (fork). Pure.
 *
 * Turns the diary (which days have food logged, and their calories) and the weigh-ins
 * into the "Timeline": a streak, how far from the start weight to the goal, the next
 * weight milestone, and a dated list of what has been reached.
 *
 * Weight milestones use the SMOOTHED weight (lib/weight-history.js), so one heavy
 * morning never un-does or fakes a milestone. All weights are kg here; amounts are
 * shown in the user's unit.
 */
import { daysBetween, addDays } from './goal-projection.js';
import { weightPhrase } from './weight-compare.js';

const LB = 2.20462;
const DAY_THRESHOLDS = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 365, 500, 730, 1000];
const WEIGH_THRESHOLDS = [1, 5, 10, 25, 50, 100, 200, 365];
const STREAK_THRESHOLDS = [7, 14, 30, 60, 100, 200, 365];

/** Milestone sizes, in the user's unit: every 1 lb (0.5 kg) at first, then wider. */
export function milestoneAmounts(unit, max) {
  const out = [];
  if (unit === 'lb') {
    for (let a = 1; a <= Math.min(10, max); a++) out.push(a);
    for (let a = 15; a <= max; a += 5) out.push(a);
  } else {
    for (let a = 0.5; a <= Math.min(5, max); a += 0.5) out.push(a);
    for (let a = 6; a <= Math.min(10, max); a++) out.push(a);
    for (let a = 12.5; a <= max; a += 2.5) out.push(a);
  }
  return out;
}

/** Consecutive-day runs. current counts back from today (or yesterday, if today is not logged yet). */
export function streaks(loggedDates, today) {
  const set = new Set(loggedDates);
  const sorted = [...set].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  let cur = 0;
  let d = set.has(today) ? today : addDays(today, -1);
  while (set.has(d)) { cur++; d = addDays(d, -1); }
  return { current: cur, longest };
}

/** The date the Nth value of a sorted list of dates was reached. */
const nthDate = (dates, n) => dates[n - 1] || null;

/** Dates on which a run of consecutive logged days first reached each length. */
function streakDates(sorted) {
  const out = new Map();
  let run = 0, prev = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    for (const t of STREAK_THRESHOLDS) if (run === t && !out.has(t)) out.set(t, d);
    prev = d;
  }
  return out;
}

/** Non-overlapping weeks where all 7 days were logged and within the calorie goal (and not nearly empty). */
export function perfectWeeks(days, calorieGoal) {
  if (!(calorieGoal > 0)) return [];
  const ok = new Map(days.filter(d => d.logged).map(d => [d.date, d.calories >= calorieGoal * 0.6 && d.calories <= calorieGoal * 1.05]));
  const dates = [...ok.keys()].sort();
  const out = [];
  let run = 0, prev = null;
  for (const d of dates) {
    run = prev && daysBetween(prev, d) === 1 && ok.get(d) && ok.get(prev) ? run + 1 : (ok.get(d) ? 1 : 0);
    prev = d;
    if (run === 7) { out.push(d); run = 0; }
  }
  return out;
}

/**
 * @param {object} p
 * @param {Array<{date:string, calories:number, logged:boolean}>} p.days  every diary day
 * @param {Array<{d:string, kg:number, t:number}>} p.series  smoothed weigh-ins, oldest first
 * @param {number|null} p.goalKg
 * @param {{date:string, kg:number}|null} p.start  where the plan started (first weigh-in by default)
 * @param {string} p.today
 * @param {number|null} p.calorieGoal
 * @param {'lb'|'kg'} p.unit
 */
export function buildProgress({ days = [], series = [], goalKg = null, start = null, today, calorieGoal = null, unit = 'lb' } = {}) {
  const logged = days.filter(d => d.logged).map(d => d.date).sort();
  const st = streaks(logged, today);
  const events = [];
  const out = { streak: st, daysLogged: logged.length, weighIns: series.length, start: null, nowKg: null, goalKg: goalKg || null, changeKg: null, fraction: null, direction: null, next: null, upcoming: {}, events };

  // ── the plan and the weight ───────────────────────────────────────────
  const first = start || (series[0] ? { date: series[0].d, kg: series[0].kg } : null);
  const now = series.length ? series[series.length - 1].t : null;
  if (first) { out.start = first; events.push({ id: 'plan-start', kind: 'plan', title: 'Plan started', date: first.date }); }
  out.nowKg = now;
  if (first && now != null) out.changeKg = Math.round((now - first.kg) * 100) / 100;

  if (first && goalKg && Math.abs(goalKg - first.kg) > 0.2) {
    const dir = goalKg < first.kg ? -1 : 1;
    out.direction = dir < 0 ? 'lose' : 'gain';
    const total = Math.abs(goalKg - first.kg);
    const progressed = now != null ? Math.max(0, (first.kg - now) * -dir) : 0;          // how far, in the goal's direction
    out.fraction = Math.max(0, Math.min(1, progressed / total));

    const toUnit = (kg) => (unit === 'lb' ? kg * LB : kg);
    const fromUnit = (v) => (unit === 'lb' ? v / LB : v);
    const amounts = milestoneAmounts(unit, toUnit(total));
    const after = series.filter(p => p.d >= first.date);
    let reached = 0;
    for (const a of amounts) {
      const target = first.kg + dir * fromUnit(a);
      const hit = after.find(p => dir < 0 ? p.t <= target : p.t >= target);
      if (!hit) { if (!out.next) out.next = { amount: a, remainingKg: now != null ? Math.max(0, dir < 0 ? now - target : target - now) : fromUnit(a), phrase: weightPhrase(fromUnit(a)) }; continue; }
      reached = a;
      events.push({ id: `milestone:${out.direction}:${a}`, kind: 'milestone', direction: out.direction, amount: a, title: `${out.direction === 'lose' ? 'Down' : 'Up'} ${a} ${unit}`, phrase: weightPhrase(fromUnit(a)), date: hit.d });
    }
    out.reachedAmount = reached;
    if (now != null && (dir < 0 ? now <= goalKg : now >= goalKg)) events.push({ id: 'goal-reached', kind: 'milestone', title: 'Goal weight reached', date: after[after.length - 1]?.d || today });
  }

  // ── achievements ──────────────────────────────────────────────────────
  for (const t of DAY_THRESHOLDS) { const d = nthDate(logged, t); if (d) events.push({ id: `days:${t}`, kind: 'achievement', title: `${t} ${t === 1 ? 'day' : 'days'} logged`, date: d }); }
  const wDates = series.map(p => p.d);
  for (const t of WEIGH_THRESHOLDS) { const d = nthDate(wDates, t); if (d) events.push({ id: `weights:${t}`, kind: 'achievement', title: `${t} ${t === 1 ? 'weight' : 'weights'} logged`, date: d }); }
  for (const [t, d] of streakDates(logged)) events.push({ id: `streak:${t}`, kind: 'achievement', title: `${t}-day streak`, date: d });
  for (const d of perfectWeeks(days, calorieGoal)) events.push({ id: `perfect:${d}`, kind: 'achievement', title: 'Perfect week', sub: 'Seven days logged, each within your calorie goal', date: d });

  events.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  // what is next, with progress
  const nextDays = DAY_THRESHOLDS.find(t => t > logged.length);
  const nextWeigh = WEIGH_THRESHOLDS.find(t => t > series.length);
  out.upcoming = {
    days: nextDays ? { target: nextDays, have: logged.length } : null,
    weights: nextWeigh ? { target: nextWeigh, have: series.length } : null,
  };
  return out;
}

/** Events the user has not been shown yet (ids not in `seen`), oldest first. The first run seeds quietly. */
export function newEvents(events, seen, { quietFirstRun = true } = {}) {
  const known = new Set(seen || []);
  const fresh = (events || []).filter(e => e.kind !== 'plan' && !known.has(e.id));
  if (quietFirstRun && (!seen || !seen.length)) return { fresh: [], mark: (events || []).map(e => e.id) };   // do not celebrate a whole back-catalogue at once
  return { fresh: fresh.sort((a, b) => a.date.localeCompare(b.date)), mark: (events || []).map(e => e.id) };
}
