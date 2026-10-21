/**
 * photo-log.js — one-tap "photo → AI → diary" logging (fork addition).
 *
 * The camera button on each meal card calls logMealPhoto(file, meal, date):
 *   1. shrink the photo,
 *   2. ask the configured AI provider (same settings / proxy as Trace) for a
 *      strict-JSON nutrition estimate of ONE serving as pictured, including a
 *      measured serving (e.g. 414 ml) and a plain label ("1 bottle (14 fl oz)"),
 *   3. save a Food with the photo as its image (so the diary shows it),
 *   4. add one serving of it to the meal.
 * onStage(stage) reports progress: 'reading' | 'analyzing' | 'saving'.
 */
import { NUTRIMENTS, Nutrition } from './nutrition.js';
import { fitImageDataUrl } from './image-fit.js';

const NUTRIENT_KEYS = NUTRIMENTS.map(n => n.id).filter(id => id !== 'kilojoules' && id !== 'salt');
const NUTRIENT_UNITS = Object.fromEntries(NUTRIMENTS.map(n => [n.id, n.unit]));
const MAX_KCAL_PER_G = 9.5; // pure fat ≈ 9; nothing real is denser

const SYSTEM_PROMPT = `You estimate nutrition from a single food photo for a food diary.
Reply with ONLY a JSON object, no markdown, no prose. Shape:
{
  "name": "short food name (max 60 chars)",
  "brand": "brand if packaging shows one, else null",
  "serving": {
    "amount": number,            // size of what is pictured, in grams or millilitres
    "unit": "g" | "ml",          // ml for drinks and liquids, g for everything else
    "label": "everyday description, e.g. \\"1 bottle (14 fl oz)\\", \\"1 bowl\\", \\"2 slices\\""
  },
  "nutrition": { "calories": number, ...other keys },  // for the WHOLE serving above
  "source": "label" | "web" | "estimate",   // where the numbers came from
  "divisible": {"count": number, "unit": "slice"} | null,  // see rules
  "question": {"text": "...", "choices": ["...", "..."]} | null,  // see rules
  "confidence": "high" | "medium" | "low",
  "note": "one short sentence on what you assumed, or null"
}
Rules:
- One serving = everything pictured that the person is about to eat or drink.
- If a label, can or bottle shows a size (e.g. "14 FL OZ (414 mL)", "20 oz", "355 ml"),
  use that exact size for serving.amount and say it in serving.label.
- If a Nutrition Facts panel or front-of-pack numbers are visible (e.g. "170 calories",
  "26 g protein"), use those numbers over your own estimate, scaled to the serving.
- Nutrition values are for the whole serving, NOT per 100 g/ml.
- Allowed nutrition keys (units): ${NUTRIENT_KEYS.map(k => `${k} (${NUTRIENT_UNITS[k]})`).join(', ')}.
  Always include calories, proteins, carbohydrates, fat. Include others when you can estimate them.
- You may get several photos of the same item (e.g. the front and the Nutrition Facts panel).
  Treat them as one item. Numbers read from a Nutrition Facts panel win over everything else (source "label").
- If you have a web search tool, use it for packaged/branded products and chain-restaurant items
  to find the official nutrition for that exact product and size (source "web"). If nothing
  reliable turns up, give your best estimate (source "estimate", confidence "low" or "medium").
- divisible: if what's pictured is naturally shared or split (a whole pizza, a cake or pie, a box of
  nuggets, a sandwich cut in halves, a bag with several servings), give how many pieces it splits into
  and what one piece is called ({"count": 8, "unit": "slice"}). Nutrition stays for EVERYTHING pictured.
  Otherwise null.
- question: null unless the system says questions are allowed.
- If the photo shows no food or drink, reply {"error": "short reason"}.`;

const ASK_RULES = `
Questions ARE allowed for this request: if one detail you can't see would change the calories by more
than about 15% (which dressing or sauce, fried or grilled, whole or skim milk, how many slices of a whole
pizza they'll eat is NOT a question — that's handled by divisible), set
"question": {"text": "<one short question>", "choices": ["<2 to 4 short answers>"]}.
Still return your best estimate for the most likely answer. Never ask about something visible.`;

async function _fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the photo'));
    r.readAsDataURL(file);
  });
}

function _imageMessage(provider, text, images) {
  if (provider === 'claude') {
    return { role: 'user', content: [
      ...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } })),
      { type: 'text', text },
    ] };
  }
  if (provider === 'gemini') return { role: 'user', content: text, _images: images };
  return { role: 'user', content: [
    ...images.map(image => ({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } })),
    { type: 'text', text },
  ] };
}

function _parseJson(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error("The AI didn't return nutrition data. Try again.");
  return JSON.parse(s.slice(start, end + 1));
}

/** Validate + normalise the AI's answer. Throws with a user-facing message. */
export function normalizeEstimate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error("The AI didn't return nutrition data.");
  if (raw.error) throw new Error(`No food found: ${raw.error}`);
  const name = String(raw.name || '').trim().slice(0, 60) || 'Photo meal';
  const brand = raw.brand ? String(raw.brand).trim().slice(0, 60) : null;
  let amount = Number(raw.serving?.amount);
  let unit = String(raw.serving?.unit || 'g').toLowerCase() === 'ml' ? 'ml' : 'g';
  if (!Number.isFinite(amount) || amount <= 0) { amount = 100; }
  amount = Math.round(amount * 10) / 10;
  const label = raw.serving?.label ? String(raw.serving.label).trim().slice(0, 60) : '';

  const nutrition = {};
  for (const k of NUTRIENT_KEYS) {
    const v = Number(raw.nutrition?.[k]);
    if (Number.isFinite(v) && v >= 0) nutrition[k] = Math.round(v * 10) / 10;
  }
  if (!(nutrition.calories > 0)) throw new Error("The AI couldn't estimate calories for this photo.");
  if (nutrition.calories / amount > MAX_KCAL_PER_G) {
    throw new Error(`Estimate rejected: ${nutrition.calories} kcal in ${amount} ${unit} is impossible. Try a clearer photo.`);
  }
  const warnings = [];
  const macroKcal = 4 * (nutrition.proteins || 0) + 4 * (nutrition.carbohydrates || 0) + 9 * (nutrition.fat || 0);
  if (macroKcal > 0 && Math.abs(macroKcal - nutrition.calories) > Math.max(50, nutrition.calories * 0.35)) {
    warnings.push(`Calories and macros disagree (~${Math.round(macroKcal)} kcal from P/C/F).`);
  }
  if (raw.confidence === 'low') warnings.push('Low-confidence estimate.');
  return {
    name, brand, amount, unit, label,
    nutrition,
    note: raw.note ? String(raw.note).slice(0, 200) : '',
    confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'medium',
    source: ['label', 'web', 'estimate'].includes(raw.source) ? raw.source : 'estimate',
    divisible: (() => {
      const c = Math.round(Number(raw.divisible?.count));
      const u = String(raw.divisible?.unit || '').trim().toLowerCase().slice(0, 20);
      return c >= 2 && c <= 64 && u ? { count: c, unit: u } : null;
    })(),
    question: (() => {
      const t = String(raw.question?.text || '').trim().slice(0, 140);
      const ch = Array.isArray(raw.question?.choices)
        ? raw.question.choices.map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 4) : [];
      return t && ch.length >= 2 ? { text: t, choices: ch } : null;
    })(),
    warnings,
  };
}

/** A discrete label ("1 bottle (14 fl oz)") → alt_units row so the portion
 *  picker offers "bottle" later. Only for count-style labels. */
export function _altUnitsFor(label, amount) {
  const m = String(label || '').match(/^\s*(\d+(?:\.\d+)?)\s+([a-zA-Z][a-zA-Z ]{1,20}?)(?:\s*\(|$)/);
  if (!m) return null;
  const count = Number(m[1]);
  const abbr = m[2].trim().toLowerCase().replace(/s$/, '');
  const BASE = new Set(['g', 'mg', 'kg', 'ml', 'l', 'oz', 'fl oz', 'lb', 'cup', 'tbsp', 'tsp', 'gram', 'ounce']);
  if (!count || BASE.has(abbr)) return null;
  return [{ abbr, grams: Math.round((amount / count) * 10) / 10 }];
}

/**
 * files: one File or an array (e.g. [front, nutrition label]). The first
 * photo becomes the food's picture. webSearch lets Gemini look the product
 * up online (other providers ignore it).
 */
export async function analyzeMealPhoto(files, { onStage, webSearch, askWhenUnsure = false, answers = [] } = {}) {
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean).slice(0, 3);
  if (!list.length) throw new Error('No photo');
  onStage?.('reading');
  const originals = await Promise.all(list.map(_fileToDataUrl));
  const forAi = await Promise.all(originals.map(o => fitImageDataUrl(o, 1280, 0.85)));
  const forDiary = await fitImageDataUrl(originals[0], 1280, 0.85);
  const images = forAi.map(d => {
    const [, mimeType = 'image/jpeg', base64 = ''] = d.match(/^data:([^;]+);base64,(.*)$/) || [];
    return { mimeType, base64 };
  });

  onStage?.('analyzing');
  const { aiProvider, aiModel, aiBaseUrl, aiApiKey, envLocks } = await import('../stores/settings.js');
  const { callAI, callAIProxy } = await import('./aiChat.js');
  const get = s => { let v; s.subscribe(x => v = x)(); return v; };
  const envLocked = !!get(envLocks)?.ai;
  const provider = get(aiProvider) || 'claude';
  let prompt = list.length > 1
    ? `These ${list.length} photos show the same item (e.g. front and Nutrition Facts). Estimate its nutrition. JSON only.`
    : 'Estimate the nutrition for what is pictured. JSON only.';
  // Answers the user already gave to earlier questions (fork: Ask Me When Unsure).
  const told = (answers || []).filter(a => a && a.q && a.a);
  if (told.length) {
    prompt += `\nThe user answered: ${told.map(a => `"${a.q}" → "${a.a}"`).join('; ')}. Use these; don't ask again.`;
  }
  const systemPrompt = askWhenUnsure && !told.length ? SYSTEM_PROMPT + ASK_RULES : SYSTEM_PROMPT;
  let reply;
  if (envLocked) {
    reply = await callAIProxy({ messages: [_imageMessage('openai', prompt, images)], systemPrompt, tools: [] });
  } else {
    const apiKey = get(aiApiKey);
    if (!apiKey && provider !== 'oai-compat') throw new Error('Add your AI key in Settings → AI Assistant');
    const msgProvider = provider === 'oai-compat' ? 'openai' : provider;
    const args = {
      provider, apiKey, model: get(aiModel) || undefined, baseUrl: get(aiBaseUrl) || undefined,
      messages: [_imageMessage(msgProvider, prompt, images)], systemPrompt, tools: [],
    };
    try {
      reply = await callAI({ ...args, webSearch: !!webSearch && provider === 'gemini' });
    } catch (e) {
      // Some models/keys don't allow search grounding — retry without it.
      if (!webSearch || provider !== 'gemini') throw e;
      reply = await callAI(args);
    }
  }
  return { estimate: normalizeEstimate(_parseJson(reply)), imageDataUrl: forDiary };
}

/** Scale every nutrient when the user changes the amount on the review card. */
export function rescaleEstimate(estimate, newAmount) {
  const a = Number(newAmount);
  if (!(a > 0) || !(estimate.amount > 0)) return estimate;
  const f = a / estimate.amount;
  const nutrition = Object.fromEntries(Object.entries(estimate.nutrition).map(([k, v]) => [k, Math.round(v * f * 10) / 10]));
  return { ...estimate, amount: a, nutrition };
}

/** Save the estimate as a Food (with the photo as its image). */
export async function saveEstimatedFood(estimate, imageDataUrl) {
  const { NtApi } = await import('./api.js');
  return NtApi.createFood({
    name: estimate.name,
    brand: estimate.brand,
    portion: estimate.amount,
    unit: estimate.unit,
    nutrition: estimate.nutrition,
    imgUrl: imageDataUrl,
    notes: [estimate.label, estimate.note].filter(Boolean).join(' · ') || null,
    nutrition_basis: estimate.unit,
    alt_units: estimate.divisible && estimate.wholeAmount > 0
      ? [{ abbr: estimate.divisible.unit.replace(/s$/, ''), grams: Math.round((estimate.wholeAmount / estimate.divisible.count) * 10) / 10 }]
      : _altUnitsFor(estimate.label, estimate.amount),
    visibility: 'private',
  });
}

/** Log one pictured serving of a saved photo food to a meal. Returns kcal. */
export async function logPhotoServing(food, estimate, imageDataUrl, mealIdx, date) {
  const { addDiaryItem } = await import('../stores/diary.js');
  const item = {
    ...food,
    imgUrl: food.imgUrl || imageDataUrl,
    portion: estimate.amount,
    unit: estimate.unit,
    nutrition: estimate.nutrition, // already for the whole serving
    quantity: 1,
  };
  await addDiaryItem(item, mealIdx, date);
  return Math.round(Nutrition.calculate(item).calories || 0);
}

/** Full flow: photo → estimate → saved food → (optionally) logged.
 *  mealIdx null = save to Foods only. Returns { food, estimate, kcal, imageDataUrl }. */
export async function logMealPhoto(files, mealIdx, date, { onStage, webSearch } = {}) {
  const { estimate, imageDataUrl } = await analyzeMealPhoto(files, { onStage, webSearch });
  onStage?.('saving');
  const food = await saveEstimatedFood(estimate, imageDataUrl);
  const kcal = mealIdx == null
    ? Math.round(estimate.nutrition.calories)
    : await logPhotoServing(food, estimate, imageDataUrl, mealIdx, date);
  return { food, estimate, kcal, imageDataUrl, logged: mealIdx != null };
}

/** Fork: portion of a divisible item, e.g. 2 of 8 slices → estimate for 2 slices. */
export function portionOf(whole, pieces) {
  if (!whole?.divisible || !(pieces > 0)) return whole;
  const frac = Math.min(1, pieces / whole.divisible.count);
  const amount = Math.round(whole.amount * frac * 10) / 10;
  const r = rescaleEstimate(whole, amount);
  const n = Math.round(pieces * 100) / 100;
  const label = frac >= 1 ? (whole.label || `whole (${whole.divisible.count} ${whole.divisible.unit}s)`)
    : `${n} ${n === 1 ? whole.divisible.unit.replace(/s$/, '') : whole.divisible.unit.replace(/s?$/, 's')} of ${whole.divisible.count}`;
  return { ...r, label, wholeAmount: whole.amount, pieces: n };
}
