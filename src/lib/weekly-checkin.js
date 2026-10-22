/**
 * weekly-checkin.js — the weekly check-in maths (fork addition).
 *
 * Puts the last week's intake next to the adaptive burn (TDEE) and the
 * weight trend, and says whether they agree. The same 7,700 kcal/kg the
 * adaptive TDEE uses turns a daily surplus or deficit into an expected
 * weight change per week, which is compared with the measured trend.
 *
 *   dayCalories : last 7 days' logged kcal, null/0 for a day with nothing logged
 *   adaptive    : the /api/goals/adaptive-tdee response
 */
export const KCAL_PER_KG = 7700;
const MIN_LOGGED_DAYS = 4;     // fewer logged days and an average means little
const TOLERANCE_KG_WEEK = 0.2; // within this, intake and weight agree

export function summarizeWeek({ dayCalories = [], adaptive = null } = {}) {
  const logged = dayCalories.filter(v => Number.isFinite(v) && v > 0);
  const loggedDays = logged.length;
  const avgIntake = loggedDays ? Math.round(logged.reduce((a, b) => a + b, 0) / loggedDays) : null;
  const out = {
    loggedDays, totalDays: dayCalories.length, avgIntake,
    ready: !!(adaptive && adaptive.ready && adaptive.tdee != null),
    tdee: null, dailyBalance: null, expectedKgPerWeek: null, trendKgPerWeek: null, verdict: 'empty',
    daysAvailable: adaptive?.daysAvailable ?? null, daysRequired: adaptive?.daysRequired ?? null,
  };
  if (!loggedDays) return out;
  if (loggedDays < MIN_LOGGED_DAYS) return { ...out, verdict: 'sparse' };
  if (!out.ready) return { ...out, verdict: 'building' };

  out.tdee = Math.round(adaptive.tdee);
  out.dailyBalance = avgIntake - out.tdee;                        // + surplus, - deficit
  out.expectedKgPerWeek = Math.round((out.dailyBalance * 7 / KCAL_PER_KG) * 100) / 100;
  out.trendKgPerWeek = adaptive.trendKgPerWeek ?? null;
  if (out.trendKgPerWeek == null) return { ...out, verdict: 'building' };
  const gap = out.trendKgPerWeek - out.expectedKgPerWeek;
  out.verdict = Math.abs(gap) <= TOLERANCE_KG_WEEK ? 'match' : gap > 0 ? 'heavier' : 'lighter';
  return out;
}

/** Plain-language line for a verdict. Describes; never prescribes. */
export function verdictText(v) {
  switch (v) {
    case 'match':   return 'Your weight is moving about as your intake predicts.';
    case 'heavier': return 'Your weight is trending higher than your intake predicts. Unlogged food or a lower burn than estimated would both explain that.';
    case 'lighter': return 'Your weight is trending lower than your intake predicts. Your burn may be higher than estimated, or some logged food was smaller than logged.';
    case 'sparse':  return 'Only a few days were logged this week, so the average is a rough guide.';
    case 'building':return 'Adaptive burn needs more days of weight and intake data before it can be compared.';
    default:        return 'Nothing logged in the last 7 days.';
  }
}
