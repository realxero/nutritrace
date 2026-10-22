/**
 * ai-alternatives.js — real-life alternatives from the AI assistant (fork).
 *
 * On demand only: nothing here runs until the user taps "Ask Trace". It asks
 * the user's own configured model (same keys, proxy and Gemini web search
 * setting as photo logging) for a few real products or menu items that fit
 * the goal better than the food they logged.
 *
 * Honest about certainty: an alternative is marked "checked online" only when
 * the model says it read a label or page (and Gemini search was on); otherwise
 * it is an estimate and the card says to check the label.
 */
import { normalizeEstimate } from './photo-log.js';

export const ALT_SYSTEM_PROMPT = `You suggest real, buyable alternatives to a food someone logged, to fit their goal better.
Reply with JSON only, no prose:
{"alternatives":[{"name":"<product or dish name>","brand":"<brand or null>","why":"<one short sentence on why it fits the goal>",
 "serving":{"amount":<number>,"unit":"g"|"ml","label":"<e.g. 1 bottle (355 ml)>"},
 "nutrition":{"calories":<n>,"proteins":<g>,"carbohydrates":<g>,"fat":<g>,"sugars":<g>,"fiber":<g>,"sodium":<mg>},
 "source":"web"|"label"|"estimate","confidence":"high"|"medium"|"low"}]}
Rules:
- 3 alternatives, best first. They must replace the logged food for the same purpose (a drink for a drink, a snack for a snack, a meal for a meal), similar taste or format, easy to find in ordinary stores or on common menus.
- Nutrition is for the serving given, using the same units as the serving. Be accurate; if you are not sure of a brand's exact numbers use a generic version of the food and set source "estimate".
- source "web" or "label" only if you actually looked the product up; never claim it otherwise. Do not invent brands or products.
- Respect the goal: losing weight = fewer calories with protein kept; gaining = more calories and protein; protein = more protein per calorie; balanced = less sugar and fewer calories.
- Never suggest anything in the avoid list.`;

/** The user message: the food, the goal, what is left today, what to avoid. */
export function buildAltPrompt({ item, focusLabel, remaining = {}, avoid = [], country = '' }) {
  const n = item?.nutrition || {};
  const q = parseFloat(item?.quantity) || 1;
  const lines = [
    `Logged food: ${item?.name || 'unknown'}${item?.brand ? ` (${item.brand})` : ''}`,
    `Amount logged: ${q} × ${item?.portion || ''} ${item?.unit || ''}`.trim(),
    `Nutrition per serving: ${Math.round(n.calories || 0)} kcal, ${Math.round(n.proteins || 0)} g protein, ${Math.round(n.carbohydrates || 0)} g carbs, ${Math.round(n.fat || 0)} g fat, ${Math.round(n.sugars || 0)} g sugar`,
    `Goal: ${focusLabel || 'a balanced day'}`,
  ];
  if (Number.isFinite(remaining.calories)) lines.push(`Calories left today: about ${Math.round(remaining.calories)} kcal`);
  if (Number.isFinite(remaining.protein)) lines.push(`Protein still to go today: about ${Math.round(remaining.protein)} g`);
  if (country) lines.push(`Shopping in: ${country}`);
  if (avoid.length) lines.push(`Avoid (never suggest): ${avoid.slice(0, 40).join(', ')}`);
  return lines.join('\n');
}

function parseJson(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error("Trace didn't return any options. Try again.");
  return JSON.parse(s.slice(a, b + 1));
}

/**
 * Turn the model's reply into validated alternatives. Entries the numbers
 * don't support (no calories, impossible density) are dropped, not shown.
 * @returns {Array<{estimate, why, checked:boolean}>}
 */
export function parseAlternatives(reply, { avoid = [], originalName = '' } = {}) {
  let raw;
  try { raw = parseJson(reply); } catch (e) { throw e; }
  const list = Array.isArray(raw.alternatives) ? raw.alternatives : [];
  const avoidKeys = new Set((avoid || []).map(a => String(a).toLowerCase().trim()).filter(Boolean));
  const out = [];
  const seen = new Set([String(originalName).toLowerCase().trim()]);
  for (const a of list) {
    let estimate;
    try { estimate = normalizeEstimate({ ...a, name: a?.name, serving: a?.serving, nutrition: a?.nutrition }); } catch { continue; }
    const key = `${estimate.brand || ''} ${estimate.name}`.toLowerCase().trim();
    if (seen.has(estimate.name.toLowerCase()) || seen.has(key)) continue;
    if ([...avoidKeys].some(k => k.length >= 3 && key.includes(k))) continue;
    seen.add(key);
    out.push({
      estimate,
      why: String(a?.why || '').trim().slice(0, 160),
      checked: estimate.source === 'web' || estimate.source === 'label',
    });
    if (out.length >= 4) break;
  }
  if (!out.length) throw new Error("Trace didn't find a usable option this time. Try again.");
  return out;
}

/** Ask the configured AI. `webSearch` only does anything on Gemini. */
export async function askForAlternatives({ item, focusLabel, remaining, avoid = [], webSearch = true, country = '' }) {
  const { aiProvider, aiModel, aiBaseUrl, aiApiKey, envLocks } = await import('../stores/settings.js');
  const { callAI, callAIProxy } = await import('./aiChat.js');
  const get = (s) => { let v; s.subscribe(x => (v = x))(); return v; };
  const provider = get(aiProvider) || 'claude';
  const messages = [{ role: 'user', content: buildAltPrompt({ item, focusLabel, remaining, avoid, country }) }];
  let reply;
  if (get(envLocks)?.ai) {
    reply = await callAIProxy({ messages, systemPrompt: ALT_SYSTEM_PROMPT, tools: [] });
  } else {
    const apiKey = get(aiApiKey);
    if (!apiKey && provider !== 'oai-compat') throw new Error('Add your AI key in Settings → AI Assistant');
    const args = { provider, apiKey, model: get(aiModel) || undefined, baseUrl: get(aiBaseUrl) || undefined, messages, systemPrompt: ALT_SYSTEM_PROMPT, tools: [] };
    try {
      reply = await callAI({ ...args, webSearch: !!webSearch && provider === 'gemini' });
    } catch (e) {
      if (!webSearch || provider !== 'gemini') throw e;   // some keys can't search: retry without it
      reply = await callAI(args);
    }
  }
  return parseAlternatives(reply, { avoid, originalName: item?.name });
}

/** The free-form question handed to the Trace chat ("Ask Trace" opens the chat with it). */
export function traceQuestion({ item, focusLabel }) {
  const brand = item?.brand && item.brand !== 'USDA' ? ` (${item.brand})` : '';
  return `Which real-life option would suit ${focusLabel || 'my goal'} better than ${item?.name || 'this food'}${brand}? Name products or menu items I can find in stores or on menus, with a short reason for each.`;
}
