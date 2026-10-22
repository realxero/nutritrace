/**
 * nudges.js — a heads-up in the Diary from the user's own patterns (fork). Pure.
 *
 * Only two kinds, both built on patterns that already passed lib/patterns.js's tests:
 *   food-over : the day on screen has a food that usually goes with ending over the goal
 *   weekday   : today (or a day being planned) is a weekday that tends to run heavy
 * It says what the pattern is and offers a plan; it never blames, and each one can be hidden.
 */
import { WEEKDAY_NAMES } from './patterns.js';

const key = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const weekdayOf = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, 12).getDay(); };

/**
 * @param {object} p
 * @param {Array}  p.patterns  from findPatterns({ limit: large })
 * @param {Array}  p.items     the day's diary items
 * @param {string} p.date @param {string} p.today
 * @param {number|null} p.kcalLeft  calories left for the day (goal minus eaten), when known
 * @param {boolean} p.completed
 * @param {string[]} p.dismissed ids hidden for the day
 * @returns {Array<{id,kind,text,sub,food?,weekday?}>}  at most two
 */
export function findNudges({ patterns = [], items = [], date, today, kcalLeft = null, completed = false, dismissed = [] } = {}) {
  if (!date || !today || completed || date < today) return [];
  const hidden = new Set(dismissed || []);
  const present = new Set((items || []).filter(i => i && i.type !== 'quick_calories').map(i => key(i.name)));
  const out = [];

  for (const p of patterns) {
    if (p.kind !== 'over' || !present.has(p.food)) continue;
    const id = `heads:over:${p.food}:${date}`;
    if (hidden.has(id)) continue;
    out.push({
      id, kind: 'food-over', food: p.food,
      text: `Days with ${p.food} usually end over your calorie goal (${p.withOver}% of the time, vs ${p.withoutOver}% otherwise).`,
      sub: Number.isFinite(kcalLeft) ? (kcalLeft > 0 ? `You have about ${Math.round(kcalLeft)} kcal left today. A lighter rest of the day would keep you on track.` : 'You are at your goal for the day.') : 'A lighter rest of the day would keep you on track.',
    });
  }

  const wd = weekdayOf(date);
  const w = patterns.find(p => p.kind === 'weekday' && p.weekday === wd && p.dir === 'more');
  if (w) {
    const id = `heads:weekday:${wd}:${date}`;
    if (!hidden.has(id)) out.push({
      id, kind: 'weekday', weekday: wd,
      text: `${WEEKDAY_NAMES[wd]} tend to run about ${w.deltaKcal.toLocaleString()} kcal heavier for you.`,
      sub: 'A plan that leaves room for it can help.',
    });
  }
  return out.slice(0, 2);
}
