/** Allergy/diet preferences across suggestions and AI, day plan and shopping list wiring (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { COMMON_FOODS, commonFoodToFood } from '../src/lib/common-foods.js';
import { findGapIdeas, findSwaps } from '../src/lib/suggestions.js';
import { findBetterOptions } from '../src/lib/better-options.js';
import { buildDaySuggestions } from '../src/lib/day-suggestions.js';
import { buildAltPrompt, parseAlternatives } from '../src/lib/ai-alternatives.js';
import { buildMenuPrompt, parseMenuItems } from '../src/lib/ai-restaurant.js';
import { checkFood } from '../src/lib/food-safety.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const common = COMMON_FOODS.map(e => commonFoodToFood(e));
const lib = (n, quantity = 1, extra = {}) => ({ ...commonFoodToFood(COMMON_FOODS.find(e => e.name === n)), quantity, ...extra });

const everyone = { allergens: ['milk', 'egg', 'peanut', 'tree-nut', 'soy', 'wheat', 'fish', 'shellfish', 'sesame'], diet: 'none', avoid: [], dislikes: [] };

test('protein and fiber ideas never include a food that breaks a preference', () => {
  const prefs = { allergens: ['milk', 'fish', 'shellfish'], avoid: [], diet: 'vegetarian', dislikes: ['tofu'] };
  for (const nutrient of ['proteins', 'fiber']) {
    const r = findGapIdeas({ nutrient, goal: 200, items: [], calorieGoal: 2500, common, prefs, level: 'thorough' });
    assert.ok(r.ideas.length > 0, nutrient);
    for (const i of r.ideas) assert.equal(checkFood(i.food, prefs).ok, true, `${i.food.name} (${nutrient})`);
  }
  // and without preferences the same call does offer some of the excluded foods
  const open = findGapIdeas({ nutrient: 'proteins', goal: 200, items: [], calorieGoal: 2500, common, level: 'thorough', limit: 40 });
  assert.ok(open.ideas.some(i => !checkFood(i.food, { diet: 'vegetarian' }).ok));
});

test('better options and nutrient swaps never offer a food that breaks a preference', () => {
  const prefs = { allergens: ['milk'], avoid: [], diet: 'none', dislikes: [] };
  const r = findBetterOptions(lib('Ice cream, vanilla'), { focus: 'saturated-fat', prefs, limit: 10 });
  for (const o of r.options) assert.equal(checkFood(o.food, prefs).ok, true, o.food.name);
  assert.ok(!r.options.some(o => /yogurt/i.test(o.food.name)));
  const s = buildDaySuggestions({ date: '2026-10-22', today: '2026-10-22', items: [lib('Cheese pizza slice', 5, { uuid: 'p' })], calorieGoal: 2200, common, hour: 19, prefs: { allergens: ['wheat'] } });
  for (const n of s.nutrients) assert.equal(checkFood(n.to, { allergens: ['wheat'] }).ok, true, n.to.name);
});

test('a saved zero-sugar twin that breaks a preference is not used', () => {
  const cola = { name: 'Coca-Cola', brand: 'Coca-Cola', quantity: 1, uuid: 'u', meal: 1, nutrition: { calories: 140, sugars: 39 } };
  const saved = [{ id: 9, name: 'Coke Zero with milk', brand: 'Coca-Cola', nutrition: { calories: 0, sugars: 0 } }];
  assert.equal(findSwaps([cola], saved, { prefs: { allergens: ['milk'] } })[0].source, 'generic');
  assert.equal(findSwaps([cola], saved, {})[0].source, 'saved');
});

test('AI prompts state allergies as hard rules, and say nothing when there are none', () => {
  const item = { name: 'Granola bar', quantity: 1, nutrition: { calories: 190 } };
  const withP = buildAltPrompt({ item, focusLabel: 'losing weight', prefs: { allergens: ['peanut'], diet: 'vegan' } });
  assert.match(withP, /ALLERGIES \/ MUST AVOID/);
  assert.match(withP, /Peanut/);
  assert.match(withP, /Vegan/);
  assert.doesNotMatch(buildAltPrompt({ item, focusLabel: 'x' }), /ALLERGIES/);
  assert.match(buildMenuPrompt({ restaurant: 'Chipotle', prefs: { allergens: ['milk'] } }), /ALLERGIES \/ MUST AVOID/);
});

const alt = (over = {}) => ({ name: 'Oat bar', why: 'Lighter.', serving: { amount: 40, unit: 'g', label: '1 bar' },
  nutrition: { calories: 150, proteins: 4, carbohydrates: 22, fat: 5 }, source: 'label', confidence: 'high', contains: [], ...over });

test('AI alternatives: items that name or report an allergen are dropped and counted; unreported ones are flagged', () => {
  const prefs = { allergens: ['peanut', 'milk'] };
  const reply = JSON.stringify({ alternatives: [
    alt({ name: 'Peanut crunch bar' }),                                  // name
    alt({ name: 'Mystery bar', contains: ['dairy'] }),                  // reported
    alt({ name: 'Plain oat bar' }),                                      // fine, reported clean
    alt({ name: 'Rice cake', contains: undefined }),                     // fine by name, but not reported
  ] });
  const r = parseAlternatives(reply, { prefs });
  assert.deepEqual(r.map(x => x.estimate.name), ['Plain oat bar', 'Rice cake']);
  assert.equal(r.hidden, 2);
  assert.equal(r[0].allergenConfirmed, true);
  assert.equal(r[1].allergenConfirmed, false);
  // nothing usable because of allergies: a clear message
  assert.throws(() => parseAlternatives(JSON.stringify({ alternatives: [alt({ name: 'Peanut bar' })] }), { prefs }), /conflicted with your allergies/);
});

test('AI menu items: same rules, with how-to-order text also checked', () => {
  const prefs = { allergens: ['shellfish', 'sesame'] };
  const item = (over) => ({ name: 'Bowl', order: '', why: '', serving: { amount: 400, unit: 'g', label: '1 bowl' }, nutrition: { calories: 500, proteins: 35 }, source: 'web', contains: [], ...over });
  const r = parseMenuItems(JSON.stringify({ restaurant: 'X', items: [
    item({ name: 'Shrimp bowl' }), item({ name: 'Chicken bowl', contains: ['sesame'] }), item({ name: 'Veggie bowl' }),
  ] }), { restaurant: 'X', prefs });
  assert.deepEqual(r.items.map(i => i.estimate.name), ['Veggie bowl']);
  assert.equal(r.hidden, 2);
  assert.throws(() => parseMenuItems(JSON.stringify({ items: [item({ name: 'Shrimp bowl' })] }), { prefs }), /conflicted with your allergies/);
});

test('settings: stores are synced preferences; the Foods page has the allergy block and the safety note', () => {
  const st = read('src/stores/settings.js');
  for (const k of ['dietType', 'foodAllergens', 'foodAvoid', 'foodDislikes', 'shoppingList']) assert.match(st, new RegExp(`'${k}'`));
  assert.match(st, /export const foodPrefs = derived/);
  const ui = read('src/routes/settings/Foods.svelte');
  assert.match(ui, /data-testid="food-prefs"/);
  assert.match(ui, /data-testid="safety-note"/);
  assert.match(ui, /data-testid="diet-select"/);
});

test('every place that suggests a food passes the preferences', () => {
  assert.match(read('src/components/diary/SuggestionsCard.svelte'), /prefs: \$foodPrefs/);
  assert.match(read('src/components/diary/BetterOptionSheet.svelte'), /prefs: \$foodPrefs/);
  assert.equal((read('src/components/diary/BetterOptionSheet.svelte').match(/prefs: \$foodPrefs/g) || []).length, 2);   // local options + AI
  assert.match(read('src/components/diary/RestaurantOptions.svelte'), /prefs: \$foodPrefs/);
  assert.match(read('src/components/diary/DayPlanSheet.svelte'), /prefs: \$foodPrefs/);
  // the AI badges that stop "not mentioned" reading as "safe"
  assert.match(read('src/components/diary/BetterOptionSheet.svelte'), /Allergens not confirmed/);
  assert.match(read('src/components/diary/RestaurantOptions.svelte'), /Allergens not confirmed/);
});

test('day plan and shopping list are reachable and never act on their own', () => {
  const d = read('src/routes/Diary.svelte');
  assert.equal((d.match(/value: 'plan_day'/g) || []).length, 2);
  assert.match(d, /data-testid="open-day-plan"/);
  assert.match(d, /data-testid="open-shopping"/);
  assert.match(d, /<DayPlanSheet bind:open=\{showDayPlan\}/);
  assert.match(d, /on:plan=\{\(\) => showDayPlan = true\}/);
  const p = read('src/components/diary/DayPlanSheet.svelte');
  assert.match(p, /data-testid="plan-add-all"/);
  assert.match(p, /showUndo\(`Added \$\{label\} to your diary`/);        // undoable, one Undo for the whole plan
  assert.match(p, /SAFETY_NOTE/);
  const sl = read('src/components/diary/ShoppingListSheet.svelte');
  assert.match(sl, /data-testid="shopping-add-planned"/);
  assert.match(sl, /role="checkbox"/);
});
