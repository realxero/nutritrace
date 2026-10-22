/**
 * quick-add.js — which meal a one-tap "+" logs to (fork addition).
 *
 * Time of day picks it, so the common case needs no extra tap. The toast
 * after adding names the meal, and the diary entry can be moved from there.
 * With fewer than four meals the index is clamped to the last one.
 */
export function defaultMealForNow(mealCount = 4, now = new Date()) {
  const t = now.getHours() + now.getMinutes() / 60;
  const idx = t < 10.5 ? 0 : t < 15 ? 1 : t < 20.5 ? 2 : 3;
  return Math.max(0, Math.min(idx, Math.max(1, mealCount) - 1));
}
