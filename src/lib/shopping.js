/**
 * shopping.js — the shopping list (fork).
 *
 * Pure helpers. A list item is { id, name, qty, unit, aisle, checked, source }.
 * Foods from a day plan, or from meals planned on future days in the diary, are
 * added together (2 × 1 cup rice + 1 × 1 cup rice = 3 cup rice), grouped by aisle,
 * and can be checked off, added to by hand, cleared, and shared as plain text.
 */
import { COMMON_FOODS, searchCommonFoodsScored } from './common-foods.js';

export const AISLES = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bread & grains', 'Pantry', 'Frozen & prepared', 'Drinks', 'Snacks & sweets', 'Other'];

const CATEGORY_AISLE = {
  Fruits: 'Produce', Vegetables: 'Produce', Dairy: 'Dairy & eggs', Grains: 'Bread & grains', 'Nuts & Fats': 'Pantry',
  Drinks: 'Drinks', 'Snacks & Sweets': 'Snacks & sweets', Prepared: 'Frozen & prepared',
};
const PANTRY_PROTEIN = /\b(beans?|lentils?|chickpeas?|tofu|hummus|canned|tuna)\b/i;
const FALLBACK = [
  [/\b(egg|eggs|milk|yogurt|yoghurt|cheese|butter|cream|kefir)\b/i, 'Dairy & eggs'],
  [/\b(chicken|beef|steak|pork|turkey|lamb|bacon|ham|sausage|salmon|tuna|fish|shrimp|cod|tilapia)\b/i, 'Meat & fish'],
  [/\b(apple|banana|orange|berry|berries|grape|lettuce|spinach|kale|tomato|carrot|onion|pepper|broccoli|salad|avocado|potato|fruit|vegetable|cucumber)\b/i, 'Produce'],
  [/\b(bread|rice|pasta|noodle|oats?|cereal|tortilla|bagel|flour|quinoa)\b/i, 'Bread & grains'],
  [/\b(juice|soda|coffee|tea|water|beer|wine)\b/i, 'Drinks'],
  [/\b(chocolate|candy|cookie|chips|cake|ice cream|snack|bar)\b/i, 'Snacks & sweets'],
  [/\b(oil|sauce|spice|nuts?|almonds?|peanut|butter|honey|sugar|salt|canned)\b/i, 'Pantry'],
];

/** The aisle a food is found in: its built-in category when it matches one, else by words in its name. */
export function aisleOf(name) {
  const n = String(name || '');
  const [best] = searchCommonFoodsScored(n, 1);
  if (best && best.score >= 65) {
    const cat = best.entry.category;
    if (cat === 'Proteins') {
      if (/\begg/i.test(best.entry.name)) return 'Dairy & eggs';
      return PANTRY_PROTEIN.test(best.entry.name) ? 'Pantry' : 'Meat & fish';
    }
    if (CATEGORY_AISLE[cat]) return CATEGORY_AISLE[cat];
  }
  for (const [re, aisle] of FALLBACK) if (re.test(n)) return aisle;
  return 'Other';
}

const key = (name, unit) => `${String(name || '').toLowerCase().trim()}|${String(unit || '').toLowerCase().trim()}`;
const round = (n) => Math.round(n * 100) / 100;

/**
 * Foods → list items. `entries` are diary items or plan items:
 * { name, brand?, quantity, portion, unit }. Quantity is in servings of `portion unit`.
 */
export function itemsToShopping(entries, { source = 'plan' } = {}) {
  const map = new Map();
  for (const e of entries || []) {
    if (!e || !e.name || e.type === 'quick_calories') continue;
    const servings = parseFloat(e.quantity) || 1;
    const portion = parseFloat(e.portion) || 1;
    const unit = String(e.unit || '').trim();
    const k = key(e.name, unit);
    const add = servings * portion;
    const cur = map.get(k);
    if (cur) cur.qty = round(cur.qty + add);
    else map.set(k, { id: k, name: e.name, qty: round(add), unit, aisle: aisleOf(e.name), checked: false, source });
  }
  return [...map.values()];
}

/** Add incoming items to a list, summing matching ones. A checked item that is added to again is unchecked. */
export function mergeShopping(list, incoming) {
  const out = (list || []).map(i => ({ ...i }));
  const idx = new Map(out.map((i, n) => [i.id, n]));
  for (const inc of incoming || []) {
    const n = idx.get(inc.id);
    if (n == null) { idx.set(inc.id, out.length); out.push({ ...inc }); }
    else { out[n].qty = round(out[n].qty + inc.qty); out[n].checked = false; }
  }
  return out;
}

export function addManualItem(list, text) {
  const name = String(text || '').trim().slice(0, 80);
  if (!name) return list || [];
  const id = `manual|${name.toLowerCase()}`;
  if ((list || []).some(i => i.id === id)) return list;
  return [...(list || []), { id, name, qty: 0, unit: '', aisle: aisleOf(name), checked: false, source: 'manual' }];
}

export const toggleItem = (list, id) => (list || []).map(i => i.id === id ? { ...i, checked: !i.checked } : i);
export const removeItem = (list, id) => (list || []).filter(i => i.id !== id);
export const clearChecked = (list) => (list || []).filter(i => !i.checked);

/** "3 cup", "250 g", or "" for a hand-added item with no amount. */
export function qtyText(item) {
  if (!(item.qty > 0)) return '';
  const q = Number.isInteger(item.qty) ? String(item.qty) : String(round(item.qty));
  return item.unit ? `${q} ${item.unit}` : q;
}

/** Items grouped by aisle in store order; unchecked first inside each aisle. */
export function groupByAisle(list) {
  const groups = AISLES.map(aisle => ({ aisle, items: [] }));
  for (const i of list || []) (groups.find(g => g.aisle === i.aisle) || groups[groups.length - 1]).items.push(i);
  for (const g of groups) g.items.sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));
  return groups.filter(g => g.items.length);
}

/** Plain text for sharing or pasting into notes. Checked items are left out. */
export function shoppingToText(list, { title = 'Shopping list' } = {}) {
  const lines = [title];
  for (const g of groupByAisle((list || []).filter(i => !i.checked))) {
    lines.push('', g.aisle);
    for (const i of g.items) lines.push(`- ${i.name}${qtyText(i) ? ` (${qtyText(i)})` : ''}`);
  }
  return lines.join('\n');
}

export const remainingCount = (list) => (list || []).filter(i => !i.checked).length;
