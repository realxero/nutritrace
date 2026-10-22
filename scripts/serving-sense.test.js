/** Realistic servings for saved foods, and honest "yours" labels in suggestions (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { servingSense, isConcentrated } from '../src/lib/serving-sense.js';
import { findGapIdeas } from '../src/lib/suggestions.js';
import { classifyRole, planDay } from '../src/lib/day-plan.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
// the real case: a protein powder saved with the placeholder 100 g serving
const powder = { id: 7, name: 'Vietnamese Coffee', brand: 'Boba Tea Protein', portion: 100, unit: 'g', nutrition: { calories: 410, proteins: 64.1, carbohydrates: 17.9, fat: 7.7 } };
const shake = { id: 8, name: 'Premier protein', brand: 'Premier Protein', portion: 325, unit: 'ml', usage_count: 6, nutrition: { calories: 160, proteins: 30, carbohydrates: 5, fat: 3 } };
const thigh = { name: 'Chicken thigh, cooked', portion: 1, unit: 'thigh', nutrition: { calories: 208, proteins: 29, fat: 10 } };

test('a placeholder 100 g serving of a concentrated food becomes 30 g; real servings are left alone', () => {
  const s = servingSense(powder);
  assert.equal(s.scaled, true);
  assert.equal(s.portion, 30);
  assert.ok(Math.abs(s.factor - 0.3) < 1e-9);
  assert.equal(servingSense({ name: 'Jerky', portion: 100, unit: 'g', nutrition: { calories: 410, proteins: 55 } }).scaled, true);
  assert.equal(servingSense({ name: 'Mixed nuts', portion: 100, unit: 'g', nutrition: { calories: 600, proteins: 20 } }).scaled, true);
  assert.equal(servingSense(shake).scaled, false);                         // 325 ml, 49 kcal per 100 ml
  assert.equal(servingSense({ portion: 100, unit: 'g', nutrition: { calories: 165, proteins: 31 } }).scaled, false);   // chicken breast per 100 g
  assert.equal(servingSense({ portion: 60, unit: 'g', nutrition: { calories: 220, proteins: 20 } }).scaled, false);    // a 60 g bar is already a serving
  assert.equal(servingSense(thigh).scaled, false);
  assert.equal(isConcentrated(null), false);
});

test('a powder is suggested at 30 g with its real numbers, not "100 g · 64 g protein"', () => {
  const r = findGapIdeas({ nutrient: 'proteins', goal: 200, items: [], calorieGoal: 2500, saved: [powder], common: [], limit: 5, level: 'thorough' });
  const idea = r.ideas.find(i => i.food.name === 'Vietnamese Coffee');
  assert.ok(idea, 'it is still a valid protein idea');
  assert.equal(idea.servingText, '30 g');
  assert.equal(idea.amount, 19);                    // 64.1 g × 0.3
  assert.equal(idea.kcal, 123);                     // 410 × 0.3
  assert.ok(Math.abs(idea.factor - 0.3) < 1e-9);    // adding it logs 0.3 × 100 g
});

test('a food that is only saved, never used, gets no head start; one you really log does', () => {
  const common = [{ name: 'Greek yogurt, plain nonfat', portion: 1, unit: 'cup', nutrition: { calories: 130, proteins: 23 } }];
  const never = { id: 1, name: 'Protein pudding', portion: 1, unit: 'cup', nutrition: { calories: 140, proteins: 20 }, usage_count: 0 };
  const a = findGapIdeas({ nutrient: 'proteins', goal: 150, items: [], calorieGoal: 2200, saved: [never], common, limit: 1 });
  assert.equal(a.ideas[0].food.name, 'Greek yogurt, plain nonfat', 'a never-used saved food does not outrank a better built-in');
  const habit = { ...never, usage_count: 9 };
  const b = findGapIdeas({ nutrient: 'proteins', goal: 150, items: [], calorieGoal: 2200, saved: [habit], common, limit: 1 });
  assert.equal(b.ideas[0].food.name, 'Protein pudding', 'a habit still wins');
  assert.ok(b.ideas[0].uses >= 2);
});

test('the planner never uses a concentrated saved food as a meal component, and never as a main', () => {
  assert.deepEqual(classifyRole(powder), []);
  const meals = [{ idx: 0, name: 'Breakfast' }, { idx: 1, name: 'Lunch' }, { idx: 2, name: 'Dinner' }, { idx: 3, name: 'Snacks' }];
  for (let seed = 0; seed < 6; seed++) {
    const p = planDay({ meals, remaining: { calories: 2000, protein: 140 }, saved: [{ ...powder, usage_count: 50 }], seed });
    for (const m of p.meals) for (const i of m.items) assert.notEqual(i.food.name, 'Vietnamese Coffee');
  }
});

test('the card shows the brand, the realistic serving, and a label that says what "yours" means', () => {
  const c = read('src/components/diary/SuggestionsCard.svelte');
  assert.match(c, /idea\.servingText \|\| /);
  assert.match(c, /class="sg-brand"/);
  assert.match(c, /you log it often/);
  assert.match(c, /from your foods/);
  assert.doesNotMatch(c, /' · yours'/);
  assert.match(c, /quantity: idea\.factor \|\| 1/);
});
