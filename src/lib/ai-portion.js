/**
 * ai-portion.js — builds the diary item Trace's log_food tool writes
 * (fork addition; moved out of Trace.svelte so it can be unit-tested).
 */
import { scaleFactor as _unitScaleFactor } from './units.js';
import { Nutrition } from './nutrition.js';

// ── log_food portion scaling + sanity check ─────────────────────────────
// Diary items store nutrition PRE-SCALED to the item's own portion:
// Nutrition.calculate() only multiplies by quantity. Foods.svelte
// (confirmQtyPrompt) and quick-log.js already scale by
// newPortion / food.portion before addDiaryItem. log_food did not: it
// copied food.nutrition (per food.portion, usually 100 g/ml) onto an
// item with the AI's portion, so "log this 414 ml bottle" saved the
// per-100 ml values (41 kcal instead of 170) while telling the AI it
// logged 170. This builds the item the same way the manual path does,
// and returns kcal computed from the item that is actually saved.
const _AI_MAX_KCAL_PER_G = 9.5;  // pure fat is ~9; nothing real is denser
export function buildAiDiaryItem(food, portionOverride, unitOverride, quantity, opts = {}) {
  const origPortion = parseFloat(food.portion) > 0 ? parseFloat(food.portion) : 100;
  const origUnit    = food.unit || 'g';
  // Fork: a database entry stored per 100 g/ml (Open Food Facts) logged with
  // no amount used to save exactly 100 g — a 547 ml bottle of tea became
  // 27 kcal. Make the model say how much was actually eaten or drunk.
  if (portionOverride == null && opts.perHundredNeedsPortion
      && origPortion === 100 && /^(g|ml)$/i.test(origUnit)) {
    return { error: `"${food.name}" is stored per 100 ${origUnit}, so logging it without an amount would save exactly 100 ${origUnit}. Call log_food again with portion (and unit) for what the user actually had — e.g. the whole container from the label or photo (a 547 ml bottle → portion 547, unit "ml") — or ask the user how much.` };
  }
  const newPortion  = portionOverride ?? origPortion;
  const newUnit     = unitOverride ?? origUnit;
  // Opaque units ("bottle", "scoop") only convert if this food has an
  // alt_units row for them; otherwise scaleFactor falls back to a raw
  // number ratio (1 bottle vs 100 g = x0.01), which is never right.
  const _MASS_VOL = /^(mg|g|kg|oz|lb|ml|l|tsp|tbsp|cup|fl ?oz)$/i;
  const _hasAlt = (food.alt_units || []).some(a => String(a?.abbr || '').toLowerCase() === String(newUnit).toLowerCase());
  if (String(newUnit).toLowerCase() !== String(origUnit).toLowerCase() && !_MASS_VOL.test(newUnit) && !_hasAlt) {
    return { error: `"${newUnit}" can't be converted for "${food.name}" (saved per ${origPortion} ${origUnit}). Call log_food again with portion in g or ml from the label (e.g. 414 ml for a 14 fl oz bottle).` };
  }
  // A count unit the food defines ("bottle" = 414) converts directly. For
  // drinks saved per ml with no density, the row's "grams" is treated as ml
  // (≈1 g/ml), which is what the photo logger writes.
  const _alt = (food.alt_units || []).find(a => String(a?.abbr || '').toLowerCase() === String(newUnit).toLowerCase());
  const factor = _alt && Number(_alt.grams) > 0
    ? (newPortion * Number(_alt.grams)) / origPortion
    : _unitScaleFactor(origPortion, origUnit, newPortion, newUnit, food);
  if (!Number.isFinite(factor) || factor <= 0) {
    return { error: `Could not convert ${newPortion} ${newUnit} into this food's serving (${origPortion} ${origUnit}). Call log_food again with portion in ${origUnit}, or use quantity for whole servings.` };
  }
  const nutrition = food.nutrition && typeof food.nutrition === 'object'
    ? Object.fromEntries(Object.entries(food.nutrition).map(([k, v]) =>
        [k, k === '_derived' ? v : (parseFloat(v) || 0) * factor]))
    : food.nutrition;
  const item = { ...food, portion: newPortion, unit: newUnit, nutrition, quantity };
  const totals = Nutrition.calculate(item);
  const kcal = Math.round(totals.calories || 0);

  // Sanity checks on what is about to be saved.
  if (kcal === 0 && (parseFloat(food.nutrition?.calories) || 0) > 0) {
    return { error: `Scaling "${food.name}" to ${newPortion} ${newUnit} came out to 0 kcal, so nothing was logged. Ask the user for the amount in g or ml.` };
  }
  const warnings = [];
  const amountG = /^(g|ml)$/i.test(newUnit) ? newPortion * quantity : null;
  if (amountG && kcal / amountG > _AI_MAX_KCAL_PER_G) {
    return { error: `Refusing to log: ${kcal} kcal for ${amountG} ${newUnit} is more energy than pure fat. The food's saved nutrition is probably wrong; tell the user to check "${food.name}" in the Foods tab.` };
  }
  const p = totals.proteins || 0, c = totals.carbohydrates || 0, f = totals.fat || 0;
  const macroKcal = 4 * p + 4 * c + 9 * f;
  if (kcal > 0 && macroKcal > 0 && Math.abs(macroKcal - kcal) > Math.max(50, kcal * 0.35)) {
    warnings.push(`Calories (${kcal}) don't match the macros (~${Math.round(macroKcal)} kcal from P/C/F). Tell the user the saved values for "${food.name}" may be off.`);
  }
  // Fork: cross-check against calories the user showed or said.
  const expected = Number(opts.expectedKcal);
  if (expected > 0 && kcal > 0 && Math.abs(kcal - expected) / expected > 0.2) {
    return { error: `This would log ${kcal} kcal, but the user's photo or message says about ${Math.round(expected)} kcal. Nothing was logged. Pass portion/unit so the amount matches (e.g. the full bottle), or if the database values are wrong, use propose_food with the numbers from the label.` };
  }
  return { item, kcal, factor, warnings };
}
