/** Restaurant menu options through Trace: wiring and the shared day context (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dayContext } from '../src/lib/better-options.js';
import { limitFor } from '../src/lib/day-suggestions.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const food = (cal, extra = {}) => ({ nutrition: { calories: cal, ...extra }, quantity: 1 });

test('day context: what is left, and the goal focus', () => {
  const c = dayContext({ items: [food(1200, { proteins: 60 })], calorieGoal: 2000, proteinGoal: 120, targetKg: 80, currentKg: 90, limitFor });
  assert.equal(c.remaining.calories, 800);
  assert.equal(c.remaining.protein, 60);
  assert.equal(c.focus, 'lose');
  const none = dayContext({ items: [], limitFor });
  assert.ok(Number.isNaN(none.remaining.calories));
  assert.equal(none.focus, 'balanced');
});

test('day context: a nutrient already past its limit becomes the focus when there is no weight goal', () => {
  const items = [food(900, { sodium: 2500 })];
  assert.equal(dayContext({ items, limitFor }).focus, 'sodium');
  // a weight goal still comes first
  assert.equal(dayContext({ items, targetKg: 70, currentKg: 80, limitFor }).focus, 'lose');
});

test('restaurant options only run on a button press and are labelled honestly', () => {
  const c = read('src/components/diary/RestaurantOptions.svelte');
  assert.equal((c.match(/askForMenuOptions\(/g) || []).length, 1);          // called from find() only
  assert.match(c, /on:submit\|preventDefault=\{find\}/);
  assert.match(c, /From the menu/);
  assert.match(c, /Estimate · check the menu/);
  assert.match(c, /\$aiEffectivelyEnabled/);
  assert.match(c, /data-testid="menu-ask-chat"/);
  // Add or Swap, both undoable
  assert.match(c, /original \? 'Swap' : 'Add'/);
  assert.match(c, /undoSwap\(date, from, added\)/);
  assert.match(c, /undoAdd\(date, added\)/);
});

test('reachable from a meal\'s menu in the Diary (also when the meal is empty) and from Better option', () => {
  const d = read('src/routes/Diary.svelte');
  assert.equal((d.match(/value: 'restaurant'/g) || []).length, 2);
  assert.match(d, /<RestaurantSheet bind:open=\{showRestaurant\}/);
  assert.match(read('src/components/diary/BetterOptionSheet.svelte'), /data-testid="open-restaurant"/);
  assert.match(read('src/components/diary/BetterOptionSheet.svelte'), /original=\{item\} focusKey=\{focus\}/);
});

test('recent restaurants are a synced preference', () => {
  const st = read('src/stores/settings.js');
  assert.match(st, /'recentRestaurants'/);
  assert.match(st, /createSettingStore\('recentRestaurants', \[\]\)/);
});

test('both AI features share one runner (own key, proxy, Gemini search with fallback)', () => {
  const a = read('src/lib/ai-alternatives.js');
  assert.match(a, /export async function runAi/);
  assert.match(read('src/lib/ai-restaurant.js'), /runAi\(/);
});
