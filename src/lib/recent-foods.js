/**
 * recent-foods.js — which saved foods to offer before the user types.
 *
 * "Recent" = most recently logged; "Frequent" = logged most often (at least
 * twice) and not already shown under Recent. Reads the last_used_at and
 * usage_count the app bumps whenever a food is logged.
 */
export function recentAndFrequent(foods, limit = 6) {
  const list = (Array.isArray(foods) ? foods : []).filter(f => f && f.name && !f.deleted_at);
  const recent = list
    .filter(f => f.last_used_at)
    .sort((a, b) => String(b.last_used_at).localeCompare(String(a.last_used_at)))
    .slice(0, limit);
  const seen = new Set(recent.map(f => f.id ?? f.name));
  const frequent = list
    .filter(f => (f.usage_count || 0) >= 2 && !seen.has(f.id ?? f.name))
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
  return { recent, frequent };
}
