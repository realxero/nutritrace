/** Allergy / diet / dislike filtering for suggestions (fork). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allergenHits, dietViolation, termHits, checkFood, isAllowed, normalizePrefs, hasPrefs,
  declaredAllergens, checkAiItem, prefsPromptLines, ALLERGENS, DIETS, EMPTY_PREFS,
} from '../src/lib/food-safety.js';

const f = (name, extra = {}) => ({ name, ...extra });
const hits = (name, allergens) => allergenHits(f(name), allergens);

test('milk: real dairy is caught; plant milks, nut butters and eggplant-style lookalikes are not', () => {
  for (const n of ['Cheddar cheese', 'Greek yogurt, plain nonfat', 'Milk, 2%', 'Butter', 'Ice cream, vanilla', 'Cream cheese', 'Caffe latte', 'Macaroni and cheese', 'Whey protein shake'])
    assert.deepEqual(hits(n, ['milk']), ['milk'], n);
  for (const n of ['Almond milk, unsweetened', 'Soy milk', 'Coconut milk', 'Peanut butter', 'Almond butter', 'Oat milk', 'Cocoa butter lotion', 'Dairy-free yogurt', 'Chicken breast, cooked', 'Cream of tartar'])
    assert.deepEqual(hits(n, ['milk']), [], n);
});

test('egg, peanut and tree nut', () => {
  assert.deepEqual(hits('Egg, fried', ['egg']), ['egg']);
  assert.deepEqual(hits('Mayonnaise', ['egg']), ['egg']);
  assert.deepEqual(hits('Pancakes', ['egg']), ['egg']);            // conservative
  assert.deepEqual(hits('Eggplant parmesan', ['egg']), []);
  assert.deepEqual(hits('Vegan mayo', ['egg']), []);
  assert.deepEqual(hits('Peanut butter', ['peanut']), ['peanut']);
  assert.deepEqual(hits('Pad Thai', ['peanut']), ['peanut']);
  assert.deepEqual(hits('Almonds', ['tree-nut']), ['tree-nut']);
  assert.deepEqual(hits('Mixed nuts', ['tree-nut']), ['tree-nut']);
  assert.deepEqual(hits('Peanut butter', ['tree-nut']), []);       // peanuts are legumes
  for (const n of ['Butternut squash', 'Coconut', 'Doughnut', 'Nutmeg', 'Donut'])
    assert.deepEqual(hits(n, ['tree-nut']), [], n);
});

test('soy, wheat / gluten, fish, shellfish, sesame', () => {
  for (const n of ['Tofu, firm', 'Edamame', 'Soy sauce', 'Miso soup']) assert.deepEqual(hits(n, ['soy']), ['soy'], n);
  for (const n of ['Whole wheat bread', 'Bagel, plain', 'Pasta, cooked', 'Flour tortilla', 'Oatmeal, cooked with water', 'Cheeseburger', 'Light beer', 'Cheese pizza slice'])
    assert.deepEqual(hits(n, ['wheat']), ['wheat'], n);
  for (const n of ['Corn tortilla', 'Rice noodles', 'Gluten free bread', 'Almond flour', 'Brown rice, cooked', 'Chicken breast, cooked', 'Quinoa, cooked', 'Buckwheat groats'])
    assert.deepEqual(hits(n, ['wheat']), [], n);
  for (const n of ['Salmon, cooked', 'Tuna, canned in water', 'Caesar salad', 'Worcestershire sauce']) assert.deepEqual(hits(n, ['fish']), ['fish'], n);
  assert.deepEqual(hits('Goldfish crackers', ['fish']), []);
  for (const n of ['Shrimp, cooked', 'Crab cakes', 'Calamari']) assert.deepEqual(hits(n, ['shellfish']), ['shellfish'], n);
  for (const n of ['Hummus', 'Tahini', 'Sesame chicken']) assert.deepEqual(hits(n, ['sesame']), ['sesame'], n);
});

test('only the allergens that were chosen are checked', () => {
  assert.deepEqual(hits('Peanut butter and jelly sandwich', ['milk']), []);
  assert.deepEqual(hits('Peanut butter and jelly sandwich', ['peanut', 'wheat']).sort(), ['peanut', 'wheat']);
  assert.deepEqual(allergenHits(f('Cheddar cheese'), []), []);
});

test('brand, notes, ingredients and categories count, not just the name', () => {
  assert.deepEqual(allergenHits(f('Snack bar', { notes: 'Contains peanuts and soy lecithin' }), ['peanut', 'soy']).sort(), ['peanut', 'soy']);
  assert.deepEqual(allergenHits(f('Dressing', { ingredients: 'oil, egg yolk, vinegar' }), ['egg']), ['egg']);
  assert.deepEqual(allergenHits(f('Sauce', { categories: ['Fish sauces'] }), ['fish']), ['fish']);
  assert.deepEqual(allergenHits(f('Apple', { brand: 'USDA' }), ['milk', 'egg']), []);
});

test('diet: vegetarian, pescatarian, vegan', () => {
  assert.equal(dietViolation(f('Chicken breast, cooked'), 'vegetarian'), 'meat');
  assert.equal(dietViolation(f('Bacon, cooked'), 'pescatarian'), 'meat');
  assert.equal(dietViolation(f('Salmon, cooked'), 'pescatarian'), null);
  assert.equal(dietViolation(f('Salmon, cooked'), 'vegetarian'), 'fish');
  assert.equal(dietViolation(f('Shrimp, cooked'), 'vegetarian'), 'fish');
  assert.equal(dietViolation(f('Greek yogurt, plain nonfat'), 'vegetarian'), null);
  assert.equal(dietViolation(f('Greek yogurt, plain nonfat'), 'vegan'), 'dairy');
  assert.equal(dietViolation(f('Egg whites'), 'vegan'), 'egg');
  assert.equal(dietViolation(f('Honey'), 'vegan'), 'animal product');
  assert.equal(dietViolation(f('Tofu, firm'), 'vegan'), null);
  assert.equal(dietViolation(f('Beyond burger'), 'vegetarian'), null);
  assert.equal(dietViolation(f('Veggie burger'), 'vegan'), null);
  assert.equal(dietViolation(f('Chicken breast, cooked'), 'none'), null);
});

test('dislikes and "other things to avoid" match words in the food', () => {
  assert.deepEqual(termHits(f('Mushrooms'), ['mushroom']), ['mushroom']);
  assert.deepEqual(termHits(f('Cherry tomatoes'), ['tomato']), ['tomato']);
  assert.deepEqual(termHits(f('Apple'), ['ab', 'mushroom']), []);   // too short, or not there
});

test('checkFood: every reason is reported, ok only when there are none', () => {
  const prefs = { allergens: ['milk', 'peanut'], avoid: ['mustard'], diet: 'vegetarian', dislikes: ['mushroom'] };
  assert.equal(isAllowed(f('Brown rice, cooked'), prefs), true);
  const r = checkFood(f('Chicken and mushroom pie with cheese'), prefs);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('allergen:milk'));
  assert.ok(r.reasons.includes('diet:vegetarian:meat'));
  assert.ok(r.reasons.includes('dislike:mushroom'));
  assert.equal(isAllowed(f('Anything'), EMPTY_PREFS), true);
});

test('prefs are normalised defensively', () => {
  const p = normalizePrefs({ allergens: ['milk', 'bogus'], avoid: [' x ', ''], diet: 'nonsense', dislikes: 'oops' });
  assert.deepEqual(p, { allergens: ['milk'], avoid: ['x'], diet: 'none', dislikes: [] });
  assert.equal(hasPrefs(null), false);
  assert.equal(hasPrefs({ diet: 'vegan' }), true);
  assert.equal(ALLERGENS.length, 9);
  assert.equal(DIETS[0].id, 'none');
});

test('AI answers: declared allergens count, and an unreported list is flagged unconfirmed', () => {
  assert.deepEqual(declaredAllergens(['Dairy', 'eggs', 'Gluten', 'tree nuts']), ['milk', 'egg', 'wheat', 'tree-nut']);
  assert.equal(declaredAllergens(undefined), null);
  const prefs = { allergens: ['milk', 'wheat'] };
  // the name looks fine, but the model says it contains milk
  const a = checkAiItem(f('House special bowl'), ['dairy'], prefs);
  assert.equal(a.ok, false);
  assert.ok(a.reasons.includes('allergen:milk'));
  assert.equal(a.confirmed, true);
  // a clean report passes, and says it was reported
  assert.deepEqual(checkAiItem(f('Grilled chicken salad'), [], prefs), { ok: true, reasons: [], confirmed: true });
  // no report: allowed by name, but NOT confirmed
  const u = checkAiItem(f('Grilled chicken salad'), undefined, prefs);
  assert.equal(u.ok, true);
  assert.equal(u.confirmed, false);
  // the name check still applies when the model says nothing
  assert.equal(checkAiItem(f('Cheese pizza'), [], prefs).ok, false);
});

test('prompt lines: allergies are stated as hard rules, nothing when there are no preferences', () => {
  assert.deepEqual(prefsPromptLines(EMPTY_PREFS), []);
  const lines = prefsPromptLines({ allergens: ['peanut', 'milk'], avoid: ['mustard'], diet: 'vegetarian', dislikes: ['olives'] });
  assert.match(lines[0], /ALLERGIES \/ MUST AVOID/);
  assert.match(lines[0], /Peanut/);
  assert.match(lines[0], /mustard/);
  assert.match(lines.join('\n'), /Vegetarian/);
  assert.match(lines.join('\n'), /olives/);
});

import { explainFood, COMMON_DISLIKES, REASON_TEXT } from '../src/lib/food-safety.js';

test('dislikes match whole words: short words work, and no more substring accidents', () => {
  assert.deepEqual(termHits(f('Ham, sliced'), ['ham']), ['ham']);
  assert.deepEqual(termHits(f('Hamburger (single patty)'), ['ham']), []);       // was a false hit
  assert.deepEqual(termHits(f('Peanut butter'), ['pea']), []);                    // was a false hit
  assert.deepEqual(termHits(f('Green peas'), ['pea']), ['pea']);
  assert.deepEqual(termHits(f('Oatmeal'), ['oat']), []);
  assert.deepEqual(termHits(f('Rolled oats, dry'), ['oat']), ['oat']);
  assert.deepEqual(termHits(f('Egg, fried'), ['egg']), ['egg']);
});

test('dislikes ignore plurals and match several words in any order', () => {
  assert.deepEqual(termHits(f('Cherry tomatoes'), ['tomato']), ['tomato']);
  assert.deepEqual(termHits(f('Tomato'), ['tomatoes']), ['tomatoes']);
  assert.deepEqual(termHits(f('Blue cheese dressing'), ['blue cheese']), ['blue cheese']);
  assert.deepEqual(termHits(f('Cheese, blue'), ['blue cheese']), ['blue cheese']);
  assert.deepEqual(termHits(f('Cheddar cheese'), ['blue cheese']), []);
});

test('dislikes know synonyms', () => {
  assert.deepEqual(termHits(f('Coriander chicken'), ['cilantro']), ['cilantro']);
  assert.deepEqual(termHits(f('Grilled aubergine'), ['eggplant']), ['eggplant']);
  assert.deepEqual(termHits(f('Courgette fritters'), ['zucchini']), ['zucchini']);
  assert.deepEqual(termHits(f('Garbanzo salad'), ['chickpeas']), ['chickpeas']);
  assert.deepEqual(termHits(f('Garlic prawns'), ['shrimp']), ['shrimp']);
});

test('dislikes know group words like seafood, red meat, spicy, nuts', () => {
  assert.deepEqual(termHits(f('Salmon, cooked'), ['seafood']), ['seafood']);
  assert.deepEqual(termHits(f('Shrimp, cooked'), ['seafood']), ['seafood']);
  assert.deepEqual(termHits(f('Chicken breast, cooked'), ['seafood']), []);
  assert.deepEqual(termHits(f('Pork chop, cooked'), ['red meat']), ['red meat']);
  assert.deepEqual(termHits(f('Chicken breast, cooked'), ['red meat']), []);
  assert.deepEqual(termHits(f('Jalapeño poppers'), ['spicy food']), ['spicy food']);
  assert.deepEqual(termHits(f('Chicken wings, buffalo'), ['spicy']), ['spicy']);
  assert.deepEqual(termHits(f('Walnuts'), ['nuts']), ['nuts']);
  assert.deepEqual(termHits(f('Chicken liver'), ['organ meat']), ['organ meat']);
  assert.deepEqual(termHits(f('Cherry tomatoes'), ['onions']), []);
});

test('dislikes tolerate a one-letter typo on longer words, but not on short ones', () => {
  assert.deepEqual(termHits(f('Mushrooms'), ['mushrom']), ['mushrom']);
  assert.deepEqual(termHits(f('Broccoli, cooked'), ['brocoli']), ['brocoli']);
  assert.deepEqual(termHits(f('Cilantro lime rice'), ['cilantr']), ['cilantr']);   // one letter short still matches
  assert.deepEqual(termHits(f('Pear'), ['peas']), []);                       // short words are exact only
  assert.deepEqual(termHits(f('Maple syrup'), ['apple']), []);               // first letter must match
  assert.deepEqual(termHits(f('Apple'), ['x']), []);                         // too short to mean anything
});

test('the "test a food" explanation says why, in words', () => {
  const prefs = { allergens: ['milk'], avoid: ['mustard'], diet: 'vegetarian', dislikes: ['seafood'] };
  assert.equal(explainFood('', prefs), null);
  const a = explainFood('Salmon with butter and mustard', prefs);
  assert.equal(a.ok, false);
  const text = a.reasons.map(REASON_TEXT).join('; ');
  assert.match(text, /contains Milk/);
  assert.match(text, /avoids mustard/);
  assert.match(text, /vegetarian/);
  assert.match(text, /dislike seafood/);
  assert.equal(explainFood('Brown rice', prefs).ok, true);
  assert.ok(COMMON_DISLIKES.includes('Mushrooms'));
});
