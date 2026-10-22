/**
 * suggestion-actions.js — what the buttons on a suggestion do (fork).
 *
 * Used by the Diary suggestions card and the "better option" sheet, so a swap
 * behaves the same from both: the new food is added FIRST, then the original is
 * removed by its id, so a failure part-way never leaves the day short a food.
 */
import { get } from 'svelte/store';

/** A food with a real id, saving built-in / AI foods once and reusing them after. */
export async function ensureSavedFood(food, saved = []) {
  if (food && typeof food.id === 'number') return { food, created: false };
  const { NtApi } = await import('./api.js');
  const same = (f) => f && !f.deleted_at && f.name === food.name && (f.brand || '') === (food.brand || '');
  const existing = (saved || []).find(same);
  if (existing) return { food: { ...existing, portion: food.portion ?? existing.portion, unit: food.unit ?? existing.unit, nutrition: existing.nutrition }, created: false };
  const { id: _id, uuid: _u, _source, _commonId, icon: _icon, quantity: _q, ...rest } = food;
  const made = await NtApi.createFood({ ...rest, created_at: new Date().toISOString() });
  return { food: made, created: true };
}

/** Add `to` (already a food shape) to a meal on a date. Returns the saved food. */
export async function addSuggestedFood(to, { meal, date, saved = [], quantity = 1 }) {
  const { addDiaryItem } = await import('../stores/diary.js');
  const { food } = await ensureSavedFood(to, saved);
  await addDiaryItem({
    ...food, portion: food.portion || 100, unit: food.unit || 'g', quantity, nutrition: food.nutrition,
  }, meal, date);
  return food;
}

/** Replace a logged item with another food, in the same meal. */
export async function swapDiaryItem(from, to, { date, saved = [], quantity }) {
  const { removeDiaryItem, currentEntry } = await import('../stores/diary.js');
  const meal = Number(from.meal) || 0;
  const food = await addSuggestedFood(to, { meal, date, saved, quantity: quantity ?? (parseFloat(to.quantity) || 1) });
  const latest = get(currentEntry);
  const idx = (latest?.items || []).findIndex(i => from.uuid ? i.uuid === from.uuid : i.name === from.name);
  if (idx >= 0) await removeDiaryItem(idx);
  return food;
}
