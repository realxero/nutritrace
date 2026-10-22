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
    const calories = items.reduce((a, i) => a + itemTotals(i).calories, 0);
    return { date: e.date, items, calories, logged: items.length > 0 && calories > 0 };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const weights = hist?.weights || [];
  return { days, series: smoothWeights(weights), weights };
}
