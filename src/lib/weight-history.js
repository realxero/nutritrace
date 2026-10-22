/**
 * weight-history.js — long weigh-in history, smoothed (fork).
 *
 * The server (or the local database on Android) returns raw weigh-ins,
 * [{ d: 'YYYY-MM-DD', kg, src }], one per day. This smooths them with a time-aware
 * exponential average, so a gap between weigh-ins counts for more than a day, and
 * water-weight swings do not read as progress or setbacks. The same smoothing feeds
 * the chart, the milestones and the timeline, so they always agree.
 */
import { daysBetween, addDays } from './goal-projection.js';

const TAU_DAYS = 6.7;       // ≈ 0.14 per day, the smoothing the weight trend has always used

/** Raw weigh-ins → [{ d, kg, m:true, t }] (t = smoothed weight that day). */
export function smoothWeights(weights, tau = TAU_DAYS) {
  const list = (weights || []).filter(w => w && w.d && Number.isFinite(w.kg) && w.kg > 0).sort((a, b) => a.d.localeCompare(b.d));
  const out = [];
  let ema = null, prev = null;
  for (const w of list) {
    if (ema == null) ema = w.kg;
    else {
      const dt = Math.max(1, daysBetween(prev, w.d));
      ema += (1 - Math.exp(-dt / tau)) * (w.kg - ema);
    }
    prev = w.d;
    out.push({ d: w.d, kg: w.kg, m: true, t: Math.round(ema * 100) / 100 });
  }
  return out;
}

/** The last `days` days of a smoothed series (relative to `today`). */
export function lastDays(series, days, today) {
  const from = addDays(today, -days);
  return (series || []).filter(p => p.d >= from);
}

/** How many days the series spans, first to last reading. */
export function spanDays(series) {
  return series && series.length > 1 ? daysBetween(series[0].d, series[series.length - 1].d) : 0;
}
