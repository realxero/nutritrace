/**
 * ai-restaurant.js — "what should I order here?" through Trace (fork).
 *
 * On demand only. The user names a restaurant (or a cuisine) and the AI picks
 * real menu items that fit their goal, with how to order each one ("grilled, no
 * mayo, sauce on the side"). Uses the user's own AI configuration, and Gemini web
 * search when "Check Products Online" is on.
 *
 * Honest about certainty: an item is "from the published menu" only when the
 * model says it read the restaurant's nutrition page or label; everything else is
 * an estimate and says so. An unknown restaurant is reported as unknown rather
 * than invented.
 */
import { normalizeEstimate } from './photo-log.js';
import { runAi, parseJson } from './ai-alternatives.js';
import { checkAiItem, prefsPromptLines, normalizePrefs } from './food-safety.js';

export const MENU_SYSTEM_PROMPT = `You help someone choose what to order at a restaurant, to fit their goal.
Reply with JSON only, no prose:
{"restaurant":"<name as you understand it>","items":[{"name":"<exact menu item name>","why":"<one short sentence on why it fits>",
 "order":"<how to order it, e.g. grilled instead of fried, no mayo, dressing on the side; empty if as listed>",
 "serving":{"amount":<number>,"unit":"g"|"ml","label":"<e.g. 1 bowl>"},
 "nutrition":{"calories":<n>,"proteins":<g>,"carbohydrates":<g>,"fat":<g>,"sugars":<g>,"fiber":<g>,"sodium":<mg>,"saturated-fat":<g>},
 "contains":["<each major allergen the item contains or may contain AS ORDERED: milk, egg, peanut, tree nuts, soy, wheat, fish, shellfish, sesame>"],
 "source":"web"|"label"|"estimate","confidence":"high"|"medium"|"low"}]}
Rules:
- 4 items, best fit first, all real items that restaurant actually serves. Nutrition is for the item exactly as you say to order it, for the serving given.
- Many chains publish nutrition: if you looked it up, source is "web" (or "label"). If you are working from memory or typical values, source is "estimate" and confidence is "medium" or "low". Never claim you looked something up when you did not.
- If you do not recognise the restaurant, or it is a cuisine rather than a place, give typical dishes of that kind of restaurant with source "estimate".
- If you cannot suggest anything useful, reply {"error":"<short reason>"}.
- Respect the goal: losing weight = fewer calories, protein kept; gaining = more calories and protein; protein = more protein per calorie; less sodium / fat / saturated fat / sugar = clearly lower in that; more fiber = higher fiber. Respect calories left today when given.
- Never suggest anything in the avoid list. If the user lists allergies, diet or dislikes, every item must respect them completely as ordered (say how to order it to remove an allergen only if that is realistic, and mention cross-contact risk in "order"); "contains" must be honest and complete (use [] only when you are confident none apply).`;

export function buildMenuPrompt({ restaurant, focusLabel, remaining = {}, replacing = null, avoid = [], country = '', mealName = '', prefs = null }) {
  const lines = [`Restaurant: ${String(restaurant || '').trim()}`, `Goal: ${focusLabel || 'a balanced day'}`];
  if (mealName) lines.push(`Meal: ${mealName}`);
  if (Number.isFinite(remaining.calories)) lines.push(`Calories left today: about ${Math.round(remaining.calories)} kcal`);
  if (Number.isFinite(remaining.protein)) lines.push(`Protein still to go today: about ${Math.round(remaining.protein)} g`);
  if (replacing?.name) lines.push(`They were going to have: ${replacing.name} (${Math.round(replacing.nutrition?.calories || 0)} kcal per serving)`);
  if (country) lines.push(`Country: ${country}`);
  if (avoid.length) lines.push(`Avoid (never suggest): ${avoid.slice(0, 40).join(', ')}`);
  lines.push(...prefsPromptLines(prefs));
  return lines.join('\n');
}

/**
 * Validate the model's reply. Items the numbers don't support are dropped.
 * @returns {{restaurant:string, items:Array<{estimate, why, order, fromMenu:boolean}>}}
 */
export function parseMenuItems(reply, { avoid = [], restaurant = '', prefs = null } = {}) {
  const raw = parseJson(reply);
  if (raw.error) throw new Error(String(raw.error).slice(0, 160));
  const list = Array.isArray(raw.items) ? raw.items : [];
  const avoidKeys = (avoid || []).map(a => String(a).toLowerCase().trim()).filter(a => a.length >= 3);
  const seen = new Set();
  const items = [];
  let hidden = 0;
  for (const a of list) {
    let estimate;
    try { estimate = normalizeEstimate({ ...a, brand: restaurant || raw.restaurant || null }); } catch { continue; }
    const key = estimate.name.toLowerCase();
    if (seen.has(key) || avoidKeys.some(k => key.includes(k))) continue;
    const safety = checkAiItem({ name: estimate.name, notes: `${a?.why || ''} ${a?.order || ''}` }, a?.contains, prefs);
    if (!safety.ok) { hidden++; continue; }
    seen.add(key);
    items.push({
      estimate,
      why: String(a?.why || '').trim().slice(0, 160),
      order: String(a?.order || '').trim().slice(0, 140),
      fromMenu: estimate.source === 'web' || estimate.source === 'label',
      allergenConfirmed: safety.confirmed,
    });
    if (items.length >= 5) break;
  }
  if (!items.length) throw new Error(hidden
    ? `Every item Trace found conflicted with your allergies or preferences (${hidden} hidden). Try another restaurant or a cuisine.`
    : "Trace couldn't find usable menu items. Try the restaurant's full name, or a cuisine like Thai.");
  return { restaurant: String(raw.restaurant || restaurant || '').trim().slice(0, 60), items, hidden };
}

export async function askForMenuOptions({ restaurant, focusLabel, remaining, replacing, avoid = [], webSearch = true, country = '', mealName = '', prefs = null }) {
  const name = String(restaurant || '').trim();
  if (!name) throw new Error('Type a restaurant or a cuisine first.');
  const messages = [{ role: 'user', content: buildMenuPrompt({ restaurant: name, focusLabel, remaining, replacing, avoid, country, mealName, prefs }) }];
  const reply = await runAi({ messages, systemPrompt: MENU_SYSTEM_PROMPT, webSearch });
  return parseMenuItems(reply, { avoid, restaurant: name, prefs: normalizePrefs(prefs) });
}

/** The saved food for a menu item: the restaurant is its brand, "how to order" rides in the notes. */
export function menuItemToFood(item, restaurant) {
  const e = item.estimate;
  return {
    name: e.name, brand: restaurant || e.brand || null, portion: e.amount, unit: e.unit,
    nutrition: e.nutrition, nutrition_basis: e.unit, categories: [], visibility: 'private',
    notes: [item.order ? `Order: ${item.order}` : '', e.label, item.fromMenu ? '' : 'AI estimate — check the menu'].filter(Boolean).join(' · ') || null,
  };
}

/** Recent restaurants, newest first, no duplicates (case-insensitive), at most `max`. */
export function rememberRestaurant(list, name, max = 6) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) return list || [];
  return [n, ...(list || []).filter(x => x.toLowerCase() !== n.toLowerCase())].slice(0, max);
}

/** The chat version of the question, worded so Trace never mistakes it for logging food. */
export function menuQuestion({ restaurant, focusLabel }) {
  return `What should I order at ${restaurant || 'this restaurant'} for ${focusLabel || 'my goal'}? Name real menu items, how to order them, and the rough calories.`;
}
