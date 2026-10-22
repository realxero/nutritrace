/**
 * goal-projection.js — "when will I reach my goal weight?" (fork addition).
 *
 * Pure maths, no I/O, so it is unit-tested (scripts/goal-projection.test.js).
 *
 * Two inputs are blended into a date RANGE rather than a single date, because
 * a single date promises precision the data does not have:
 *   1. intake-based pace: (average logged intake − burn) × 7 ÷ 7,700 kcal/kg
 *   2. measured pace: the weight trend from the adaptive-TDEE regression
 * When both exist and point the right way, the range spans them; with only
 * one, it is ±25% around it. With no logged data but a calorie plan and a
 * burn estimate, the plan is projected instead and labelled as such.
 *
 * Describes; never prescribes. Warnings are flags, not instructions.
 */
export const KCAL_PER_KG = 7700;
const DAY_MS = 86400000;
const MIN_LOGGED_DAYS = 4;          // of the last 14, below this the intake average means little
const GOOD_LOGGED_DAYS = 10;        // of the last 14
const NEGLIGIBLE_KG_WEEK = 0.02;    // slower than this is "not moving"
const MAX_DAYS = 730;               // beyond two years is not a projection
const AT_GOAL_KG = 0.2;
const LOW_KCAL_FLOOR = 1200;

/** 'YYYY-MM-DD' (local) → Date at local noon, so DST never shifts the day. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0);
}
export function fmtDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(dayStr, n) {
  const d = parseDay(dayStr);
  d.setDate(d.getDate() + Math.round(n));
  return fmtDay(d);
}
export function daysBetween(fromStr, toStr) {
  return Math.round((parseDay(toStr) - parseDay(fromStr)) / DAY_MS);
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {object} p
 * @param {number|null} p.currentKg      trend (smoothed) weight, falling back to latest
 * @param {number|null} p.targetKg
 * @param {number|null} p.tdee           adaptive burn, or the profile estimate
 * @param {boolean}     p.tdeeIsAdaptive true when tdee came from the adaptive calculation
 * @param {number|null} p.avgIntake      average of logged days (last 14)
 * @param {number}      p.loggedDays     how many of the last 14 days have food logged
 * @param {number|null} p.trendKgPerWeek measured weight change per week (signed)
 * @param {number|null} p.plannedIntake  the calorie goal, for the "if you hit your goal" view
 * @param {string|null} p.targetDate     'YYYY-MM-DD' the user wants to be there by
 * @param {string}      p.today          'YYYY-MM-DD'
 */
export function projectGoal(p = {}) {
  const {
    currentKg = null, targetKg = null, tdee = null, tdeeIsAdaptive = false,
    avgIntake = null, loggedDays = 0, trendKgPerWeek = null, plannedIntake = null,
    targetDate = null, today,
  } = p;

  const out = {
    status: 'ok', direction: null, remainingKg: null, basis: null, confidence: 'low',
    ratePerWeekKg: null, earliest: null, latest: null, daysEarliest: null, daysLatest: null,
    farAway: false, needMoreDays: 0, required: null, pace: null, warnings: [],
  };

  if (!finite(targetKg) || targetKg <= 0) return { ...out, status: 'no-target' };
  if (!finite(currentKg) || currentKg <= 0) return { ...out, status: 'no-weight' };

  const diff = targetKg - currentKg;               // + gain, − lose
  out.remainingKg = Math.round(Math.abs(diff) * 100) / 100;
  out.direction = diff < 0 ? 'lose' : 'gain';
  if (Math.abs(diff) <= AT_GOAL_KG) return { ...out, status: 'reached', direction: null };

  const want = diff < 0 ? -1 : 1;                  // the sign a useful rate must have

  // ---- required pace for a chosen date (independent of the pace estimate) ----
  if (targetDate && today && parseDay(targetDate)) {
    const daysLeft = daysBetween(today, targetDate);
    if (daysLeft <= 0) {
      out.required = { daysLeft, past: true };
    } else {
      const kgPerWeek = (Math.abs(diff) / daysLeft) * 7;
      const balance = (diff * KCAL_PER_KG) / daysLeft;            // signed kcal/day
      const limit = want < 0 ? 0.01 : 0.005;                       // % of body weight per week
      const req = {
        daysLeft, past: false,
        kgPerWeek: Math.round(kgPerWeek * 100) / 100,
        dailyBalance: Math.round(balance),
        kcalPerDay: finite(tdee) ? Math.round(tdee + balance) : null,
        aggressive: kgPerWeek > currentKg * limit,
        belowFloor: finite(tdee) && tdee + balance < LOW_KCAL_FLOOR,
      };
      out.required = req;
      if (req.aggressive) out.warnings.push('aggressive');
      if (req.belowFloor) out.warnings.push('low-calories');
    }
  }

  // ---- how fast are you actually going? ----
  const rates = [];
  const haveLog = finite(avgIntake) && loggedDays >= MIN_LOGGED_DAYS && finite(tdee);
  if (haveLog) {
    rates.push({ kind: 'intake', kgWeek: ((avgIntake - tdee) * 7) / KCAL_PER_KG });
    out.basis = 'logged';
  }
  if (finite(trendKgPerWeek) && tdeeIsAdaptive) rates.push({ kind: 'trend', kgWeek: trendKgPerWeek });

  if (!rates.length && finite(plannedIntake) && finite(tdee)) {
    rates.push({ kind: 'plan', kgWeek: ((plannedIntake - tdee) * 7) / KCAL_PER_KG });
    out.basis = 'plan';
  }
  if (!out.basis && rates.length) out.basis = 'logged';

  out.confidence = out.basis === 'plan' ? 'low'
    : loggedDays >= GOOD_LOGGED_DAYS ? 'good' : loggedDays >= MIN_LOGGED_DAYS ? 'fair' : 'low';
  if (out.basis !== 'plan' && loggedDays < GOOD_LOGGED_DAYS) out.needMoreDays = GOOD_LOGGED_DAYS - loggedDays;

  if (!rates.length) return { ...out, status: 'no-estimate' };

  const right = rates.filter(r => Math.sign(r.kgWeek) === want && Math.abs(r.kgWeek) >= NEGLIGIBLE_KG_WEEK);
  const central = rates.find(r => r.kind === (out.basis === 'plan' ? 'plan' : 'intake')) || rates[0];
  out.ratePerWeekKg = Math.round(central.kgWeek * 100) / 100;

  if (!right.length) {
    // Not moving, or moving the wrong way. Say so rather than inventing a date.
    const wrongWay = Math.sign(central.kgWeek) === -want && Math.abs(central.kgWeek) >= NEGLIGIBLE_KG_WEEK;
    return { ...out, status: wrongWay ? 'wrong-way' : 'no-progress' };
  }

  const mags = right.map(r => Math.abs(r.kgWeek));
  let fast, slow;
  if (mags.length > 1) { fast = Math.max(...mags) * 1.1; slow = Math.min(...mags) * 0.9; }
  else { fast = mags[0] * 1.25; slow = mags[0] * 0.75; }
  out.pace = { fast: Math.round(fast * 100) / 100, slow: Math.round(slow * 100) / 100 };

  const dEarly = Math.ceil((Math.abs(diff) / fast) * 7);
  const dLate = Math.ceil((Math.abs(diff) / slow) * 7);
  out.daysEarliest = dEarly;
  out.daysLatest = dLate;
  if (dEarly > MAX_DAYS) return { ...out, status: 'far-away', farAway: true };
  out.earliest = addDays(today, dEarly);
  out.latest = addDays(today, Math.min(dLate, MAX_DAYS * 3));
  out.farAway = dLate > MAX_DAYS;

  if (out.required && !out.required.past && out.earliest) {
    const dl = out.required.daysLeft;
    out.onTrack = dLate <= dl ? 'ahead' : dEarly <= dl ? 'on-track' : 'behind';
  }
  // A pace above 1% of body weight a week is worth flagging even without a date.
  const limit = want < 0 ? 0.01 : 0.005;
  if (fast > currentKg * limit && !out.warnings.includes('aggressive')) out.warnings.push('fast-pace');
  return out;
}

/** Plain-language one-liner for the status. */
export function statusText(r, { weightLabel = (kg) => `${kg} kg` } = {}) {
  switch (r.status) {
    case 'no-target':   return 'Set a goal weight to see when you could reach it.';
    case 'no-weight':   return 'Log a weigh-in and the estimate will appear.';
    case 'reached':     return 'You are at your goal weight.';
    case 'no-estimate': return 'Log your food for a few days and the estimate will appear.';
    case 'no-progress': return 'Your weight is holding steady at this intake, so there is no date yet.';
    case 'wrong-way':   return r.direction === 'lose'
      ? 'At this intake your weight is trending up, away from your goal.'
      : 'At this intake your weight is trending down, away from your goal.';
    case 'far-away':    return 'At this pace it is more than two years away.';
    default:            return '';
  }
}

/**
 * The one place that turns the /api/goals/adaptive-tdee response and the
 * user's settings into projectGoal() inputs, so the Goal weight card and the
 * weekly check-in always agree.
 */
export function projectFromAdaptive({ adaptive = null, targetKg = null, targetDate = null, plannedIntake = null,
  profileKg = null, profileTdee = null, today } = {}) {
  const adaptiveReady = !!(adaptive && adaptive.ready && adaptive.tdee != null);
  const currentKg = adaptive?.trendWeightKg ?? adaptive?.latestWeightKg ?? profileKg ?? null;
  const weightFrom = adaptive?.trendWeightKg != null ? 'trend' : adaptive?.latestWeightKg != null ? 'latest' : 'profile';
  const result = projectGoal({
    currentKg, targetKg: Number(targetKg) || null,
    tdee: adaptiveReady ? adaptive.tdee : profileTdee, tdeeIsAdaptive: adaptiveReady,
    avgIntake: adaptive?.recentAvgIntake ?? null, loggedDays: adaptive?.recentLoggedDays ?? 0,
    trendKgPerWeek: adaptiveReady ? adaptive.trendKgPerWeek : null,
    plannedIntake, targetDate: targetDate || null, today,
  });
  return { result, currentKg, weightFrom };
}

const nearest50 = (n) => Math.round(n / 50) * 50;

/**
 * A calorie adjustment for the weekly check-in, only when a goal DATE is set
 * (the date is the user's own target, so the number follows from it).
 * Compares the recent average intake with what the date needs.
 *
 * @returns {null | {kind:'on-track'|'less'|'more'|'too-soon', deltaKcal:number, kcalPerDay:number|null}}
 */
export function suggestAdjustment(result, avgIntake, loggedDays = 0) {
  const req = result?.required;
  if (!req || req.past || req.kcalPerDay == null || !Number.isFinite(avgIntake) || loggedDays < MIN_LOGGED_DAYS) return null;
  if (req.belowFloor) return { kind: 'too-soon', deltaKcal: 0, kcalPerDay: req.kcalPerDay };
  // What you would change today: + means eat less (losing) / eat more (gaining).
  const losing = result.direction === 'lose';
  const delta = losing ? avgIntake - req.kcalPerDay : req.kcalPerDay - avgIntake;
  if (Math.abs(delta) <= 100) return { kind: 'on-track', deltaKcal: 0, kcalPerDay: req.kcalPerDay };
  if (delta > 0) return { kind: losing ? 'less' : 'more', deltaKcal: nearest50(delta), kcalPerDay: req.kcalPerDay };
  // Eating on the slow side of what the date needs: room to spare when losing.
  return { kind: losing ? 'more' : 'less', deltaKcal: nearest50(-delta), kcalPerDay: req.kcalPerDay };
}

/** Plain-language line for an adjustment. Offers; never insists. */
export function adjustmentText(adj, dateLabel = 'your date') {
  if (!adj) return '';
  const n = adj.deltaKcal.toLocaleString();
  switch (adj.kind) {
    case 'on-track': return `Your recent intake fits ${dateLabel}. No change needed.`;
    case 'too-soon': return `${dateLabel} would need a very low intake. A later date is the kinder fix.`;
    case 'less':     return `To reach ${dateLabel}, about ${n} kcal a day less than your recent average would do it.`;
    default:         return `You could eat about ${n} kcal a day more than your recent average and still reach ${dateLabel}.`;
  }
}
