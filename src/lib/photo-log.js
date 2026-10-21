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
- If the photo shows no food or drink, reply {"error": "short reason"}.`;

async function _fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the photo'));
    r.readAsDataURL(file);
  });
}

function _imageMessage(provider, text, image) {
  if (provider === 'claude') {
    return { role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } },
      { type: 'text', text },
    ] };
  }
  if (provider === 'gemini') return { role: 'user', content: text, _image: image };
  return { role: 'user', content: [
    { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
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

export async function analyzeMealPhoto(file, { onStage } = {}) {
  onStage?.('reading');
  const original = await _fileToDataUrl(file);
  // Small copy for the AI (cheaper, faster); bigger copy kept for the diary.
  const forAi = await fitImageDataUrl(original, 1024, 0.85);
  const forDiary = await fitImageDataUrl(original, 1280, 0.85);
  const [, mime = 'image/jpeg', base64 = ''] = forAi.match(/^data:([^;]+);base64,(.*)$/) || [];

  onStage?.('analyzing');
  const { aiProvider, aiModel, aiBaseUrl, aiApiKey, envLocks } = await import('../stores/settings.js');
  const { callAI, callAIProxy } = await import('./aiChat.js');
  const get = s => { let v; s.subscribe(x => v = x)(); return v; };
  const envLocked = !!get(envLocks)?.ai;
  const provider = get(aiProvider) || 'claude';
  const prompt = 'Estimate the nutrition for what is pictured. JSON only.';
  const image = { mimeType: mime, base64 };
  let reply;
  if (envLocked) {
    reply = await callAIProxy({ messages: [_imageMessage('openai', prompt, image)], systemPrompt: SYSTEM_PROMPT, tools: [] });
  } else {
    const apiKey = get(aiApiKey);
    if (!apiKey && provider !== 'oai-compat') throw new Error('Add your AI key in Settings → AI Assistant');
    const msgProvider = provider === 'oai-compat' ? 'openai' : provider;
    reply = await callAI({
      provider, apiKey, model: get(aiModel) || undefined, baseUrl: get(aiBaseUrl) || undefined,
      messages: [_imageMessage(msgProvider, prompt, image)], systemPrompt: SYSTEM_PROMPT, tools: [],
    });
  }
  return { estimate: normalizeEstimate(_parseJson(reply)), imageDataUrl: forDiary };
}

/** Full flow. Returns { food, estimate, kcal, mealName }. */
export async function logMealPhoto(file, mealIdx, date, { onStage } = {}) {
  const { estimate, imageDataUrl } = await analyzeMealPhoto(file, { onStage });
  onStage?.('saving');
  const { NtApi } = await import('./api.js');
  const food = await NtApi.createFood({
    name: estimate.name,
    brand: estimate.brand,
    portion: estimate.amount,
    unit: estimate.unit,
    nutrition: estimate.nutrition,
    imgUrl: imageDataUrl,
    notes: [estimate.label, estimate.note].filter(Boolean).join(' · ') || null,
    nutrition_basis: estimate.unit,
    alt_units: _altUnitsFor(estimate.label, estimate.amount),
    visibility: 'private',
  });
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
  const kcal = Math.round(Nutrition.calculate(item).calories || 0);
  return { food, estimate, kcal };
}
