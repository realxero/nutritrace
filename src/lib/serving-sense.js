/**
 * serving-sense.js — is this saved food's "serving" a realistic amount to eat? (fork)
 *
 * Foods saved from a label often carry the placeholder serving "100 g" with the numbers
 * per 100 g. For most foods that is fine, but for a protein powder (64 g protein and 410 kcal
 * per 100 g), jerky, nuts or any other concentrated food nobody eats 100 g at a time, and
 * suggesting "100 g · 64 g protein" is misleading. For those, a suggestion uses a 30 g
 * serving instead, and says so. Foods with a real serving (a can, a slice, 325 ml) are left alone.
 */
const SERVING_G = 30;

/**
 * @returns {{scaled:boolean, factor:number, portion:number, unit:string}}
 *   factor = how many saved "servings" make the realistic one (0.3 for 30 g of a 100 g food).
 */
export function servingSense(food) {
  const portion = parseFloat(food?.portion);
  const unit = String(food?.unit || '').toLowerCase();
  const same = { scaled: false, factor: 1, portion: Number.isFinite(portion) ? portion : 1, unit: food?.unit || '' };
  if (!(portion >= 80) || (unit !== 'g' && unit !== 'ml')) return same;
  const n = food?.nutrition || {};
  const kcal100 = ((parseFloat(n.calories) || 0) * 100) / portion;
  const protein100 = ((parseFloat(n.proteins) || 0) * 100) / portion;
  if (kcal100 >= 400 || protein100 >= 40) return { scaled: true, factor: SERVING_G / portion, portion: SERVING_G, unit };
  return same;
}

export const isConcentrated = (food) => servingSense(food).scaled;
