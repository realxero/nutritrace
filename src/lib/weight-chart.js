/**
 * weight-chart.js — geometry for the weight trend chart (fork).
 *
 * Pure: turns the weigh-in series, the goal and the projection into SVG
 * coordinates, so it can be unit-tested without a browser. Draws:
 *   dots   : actual weigh-ins (not interpolated days)
 *   trend  : the smoothed (EMA) line
 *   goal   : a horizontal goal line
 *   cone   : the wedge from today's trend weight to the goal line, bounded by the
 *            fastest and slowest recent pace, i.e. the same date RANGE the card states
 * x is in days from today (negative = past); y is kg. The component formats labels.
 */
import { daysBetween, addDays } from './goal-projection.js';

const MIN_FUTURE_DAYS = 14;
const MAX_FUTURE_DAYS = 365;

/**
 * @param {object} p
 * @param {Array<{d:string,kg:number,m:boolean,t:number}>} p.series  oldest first
 * @param {number|null} p.targetKg
 * @param {object|null} p.projection  projectGoal() result
 * @param {string} p.today  'YYYY-MM-DD'
 * @param {'goal'|'history'} p.mode
 */
export function buildChart({ series = [], targetKg = null, projection = null, today, mode = 'goal', width = 340, height = 190,
  pad = { l: 40, r: 14, t: 14, b: 26 } } = {}) {
  const pts = (series || []).filter(s => s && Number.isFinite(s.t) && s.d).map(s => ({ ...s, x: daysBetween(today, s.d) }));
  if (pts.length < 2) return { empty: true };

  const dir = projection?.direction === 'gain' ? 1 : projection?.direction === 'lose' ? -1 : 0;
  const showCone = mode === 'goal' && projection?.status === 'ok' && projection.earliest && projection.pace && dir !== 0;
  const w0 = pts[pts.length - 1].t;                                 // today's trend weight
  const dEarly = showCone ? projection.daysEarliest : 0;
  const dLate = showCone ? projection.daysLatest : 0;
  const horizon = showCone
    ? Math.min(Math.max(Math.ceil(dLate * 1.08), MIN_FUTURE_DAYS), MAX_FUTURE_DAYS)
    : (mode === 'goal' ? MIN_FUTURE_DAYS : 0);

  // History shown: all of it for the history view; in goal view, enough to read the direction
  // without squeezing the future into a corner.
  const histDays = -pts[0].x;
  const keepDays = mode === 'history' ? histDays : Math.min(histDays, Math.max(14, Math.round(horizon * 0.5)));
  const win = pts.filter(p => p.x >= -keepDays);
  const xMin = -keepDays, xMax = Math.max(horizon, 1);

  // y range: the data in view, the goal, and where the cone ends
  const ys = win.flatMap(p => [p.t, p.kg]);
  if (Number.isFinite(targetKg)) ys.push(targetKg);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = Math.max(hi - lo, 1);
  const yMin = lo - span * 0.08, yMax = hi + span * 0.08;

  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin)) * iw;
  const sy = (kg) => pad.t + (1 - (kg - yMin) / (yMax - yMin)) * ih;
  const r1 = (n) => Math.round(n * 10) / 10;
  const P = (x, kg) => `${r1(sx(x))},${r1(sy(kg))}`;

  const out = {
    empty: false, width, height, pad, xMin, xMax, yMin, yMax, today, mode,
    todayX: r1(sx(0)),
    dots: win.filter(p => p.m).map(p => ({ x: r1(sx(p.x)), y: r1(sy(p.kg)), d: p.d, kg: p.kg })),
    trend: win.map((p, i) => `${i ? 'L' : 'M'}${P(p.x, p.t)}`).join(' '),
    trendEnd: { x: r1(sx(0)), y: r1(sy(w0)), kg: w0 },
    goal: Number.isFinite(targetKg) ? { y: r1(sy(targetKg)), kg: targetKg } : null,
    cone: null, eta: null,
    yTicks: [yMin + (yMax - yMin) * 0.12, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.12].map(kg => ({ kg, y: r1(sy(kg)) })),
    xLabels: [{ x: r1(sx(xMin)), d: addDays(today, xMin) }, { x: r1(sx(0)), d: today, today: true }],
  };

  if (showCone) {
    const perDayFast = (projection.pace.fast / 7) * dir, perDaySlow = (projection.pace.slow / 7) * dir;
    const pts2 = [P(0, w0)];
    // fast edge reaches the goal at dEarly
    pts2.push(P(Math.min(dEarly, xMax), dEarly <= xMax ? targetKg : w0 + perDayFast * xMax));
    if (dLate <= xMax) {
      pts2.push(P(dLate, targetKg));                                // slow edge reaches the goal at dLate
    } else {
      pts2.push(P(xMax, targetKg), P(xMax, w0 + perDaySlow * xMax)); // slow edge is still on its way at the right edge
    }
    out.cone = pts2.join(' ');
    out.eta = { early: dEarly <= xMax ? r1(sx(dEarly)) : null, late: dLate <= xMax ? r1(sx(dLate)) : null,
      earlyDate: projection.earliest, lateDate: projection.latest };
    out.xLabels.push({ x: r1(sx(Math.min(dLate, xMax))), d: dLate <= xMax ? projection.latest : addDays(today, xMax), eta: true });
  } else if (horizon > 0) {
    out.xLabels.push({ x: r1(sx(xMax)), d: addDays(today, xMax) });
  }
  return out;
}
