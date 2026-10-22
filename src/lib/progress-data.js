/**
 * progress-data.js — fetches what the Progress card, Timeline and Patterns need (fork).
 * Kept apart from the pure maths (progress.js, patterns.js, weight-history.js) so those stay testable.
 */
import { NtApi } from './api.js';
import { itemTotals } from './suggestions.js';
import { smoothWeights } from './weight-history.js';

/**
 * @returns {Promise<{ days: Array<{date,items,calories,logged}>, series: Array, weights: Array }>}
 * Every diary day, plus the smoothed weigh-in history. Either half may be empty.
 */
export async function loadProgressData() {
  const [all, hist] = await Promise.all([
    NtApi.getAllDiary().catch(() => []),
    NtApi.get('/api/goals/weight-history?days=3650').catch(() => ({ weights: [] })),
  ]);
  const days = (Array.isArray(all) ? all : []).filter(e => e && e.date).map(e => {
    const items = Array.isArray(e.items) ? e.items : [];
    let calories = 0, protein = 0;
    for (const i of items) { const t = itemTotals(i); calories += t.calories; protein += t.proteins; }
    return { date: e.date, items, calories, protein, logged: items.length > 0 && calories > 0 };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const weights = hist?.weights || [];
  return { days, series: smoothWeights(weights), weights };
}

// The Diary, the Goals page and the nudges all want the same history; reading every diary
// day each time would be wasteful. One shared copy, fresh for a few minutes.
let _cache = null, _cacheAt = 0, _inflight = null;
const TTL_MS = 5 * 60 * 1000;

export function invalidateProgressCache() { _cache = null; _cacheAt = 0; }

/** loadProgressData(), reused for a few minutes. */
export async function getProgressData({ force = false } = {}) {
  if (!force && _cache && Date.now() - _cacheAt < TTL_MS) return _cache;
  if (_inflight) return _inflight;
  _inflight = loadProgressData().then(d => { _cache = d; _cacheAt = Date.now(); return d; }).finally(() => { _inflight = null; });
  return _inflight;
}
