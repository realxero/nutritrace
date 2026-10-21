/**
 * food-match.js — pure helpers for Smart Log matching (fork addition).
 * No app imports, so scripts/food-match.test.js can test them directly.
 */
const _STOP = new Set(['a','an','the','of','with','and','in','to','my','from','for','some','on','at']);
const _PART_WORDS = new Set(['roll','rolls','bun','buns','bread','mix','sauce','seasoning','powder','dressing',
  'syrup','crust','dough','wrapper','wrappers','shell','shells','spread','topping','glaze','marinade','extract','filling','flavoring']);
export function _tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f ]+/g, ' ').split(/\s+/)
    .filter(t => t && !_STOP.has(t)).map(t => t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
}
/** 0..1: how well a database food matches what the user said. */
export function relevanceScore(item, food) {
  const q = _tokens(item.name);
  if (!q.length) return 0;
  const hay = new Set(_tokens(`${food.name || ''} ${food.brand || ''}`));
  const covered = q.filter(t => hay.has(t)).length / q.length;
  const qset = new Set(q);
  const nameToks = _tokens(food.name);
  const part = nameToks.some(t => _PART_WORDS.has(t) && !qset.has(t));
  const extra = nameToks.filter(t => !qset.has(t)).length;
  let score = covered * (part ? 0.4 : 1) - Math.min(0.3, extra * 0.05);
  if (item.brand) {
    const b = _tokens(item.brand);
    if (b.length && !b.every(t => hay.has(t))) score -= 0.35; // named brand missing → below GOOD_MATCH
  }
  return Math.max(0, Math.min(1, score));
}
export function cleanEstimate(e) {
  if (!e || typeof e !== 'object') return null;
  const out = {};
  for (const k of ['grams','calories','proteins','carbohydrates','fat','fiber','sugars','sodium']) {
    const v = Number(e[k]);
    if (Number.isFinite(v) && v >= 0) out[k] = v;
  }
  if (!(out.calories > 0)) return null;
  if (!(out.grams > 0)) out.grams = 100;
  if (out.calories / out.grams > 9.5) return null; // physically impossible → ignore
  return out;
}
/** The AI's estimate as a food row (per ONE unit, like a database food). */
export function aiCandidate(item) {
  const e = item.estimate;
  if (!e) return null;
  const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  const unitIsMass = /^(g|grams?|ml)$/i.test(item.unit || '');
  const div = unitIsMass ? 1 : qty;           // "2 eggs" → per egg
  const portion = Math.round((e.grams / div) * 10) / 10 || 100;
  const nutrition = {};
  for (const k of ['calories','proteins','carbohydrates','fat','fiber','sugars','sodium']) {
    if (e[k] != null) nutrition[k] = Math.round((e[k] / div) * 10) / 10;
  }
  const label = item.brand ? `${item.brand} ${item.name}` : item.name;
  return {
    name: label.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60),
    brand: item.brand || null,
    portion, unit: 'g', nutrition,
    notes: 'AI estimate',
    _ai: true, _source: 'ai',
  };
}
export const GOOD_MATCH = 0.7;
