// Fork: built-in USDA common foods — data integrity, search, portions, icons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_FOODS, searchCommonFoods, searchCommonFoodsScored, commonFoodToFood,
         parseServingLabel, foodEmoji } from '../src/lib/common-foods.js';
import { scaleFactor } from '../src/lib/units.js';

const byName = (n) => COMMON_FOODS.find(e => e.name === n);

test('data: 174 foods, unique ids/names, every food has calories, protein/carbs/fat and a portion', () => {
  assert.equal(COMMON_FOODS.length, 174);
  assert.equal(new Set(COMMON_FOODS.map(e => e.id)).size, COMMON_FOODS.length);
  assert.equal(new Set(COMMON_FOODS.map(e => e.name)).size, COMMON_FOODS.length);
  for (const e of COMMON_FOODS) {
    assert.ok(Number.isFinite(e.per100g.calories), `${e.name} calories`);
    for (const k of ['proteins', 'carbohydrates', 'fat']) assert.ok(Number.isFinite(e.per100g[k]), `${e.name} ${k}`);
    assert.ok(e.servings.length >= 1 && e.servings[0].grams > 0, `${e.name} portion`);
    assert.equal(new Set(e.servings.map(s => s.label)).size, e.servings.length, `${e.name} repeated portion`);
    assert.ok(e.icon, `${e.name} icon`);
  }
});

test('data: calories agree with 4/4/9 macros (except drinks and high-fiber produce)', () => {
  const fibrous = new Set(['Lemon', 'Lime', 'Broccoli', 'Spinach', 'Kale', 'Cauliflower', 'Mushrooms', 'Asparagus']);
  for (const e of COMMON_FOODS) {
    const n = e.per100g, k = n.calories;
    if (k <= 20 || e.category === 'Drinks' || fibrous.has(e.name)) continue;
    const m = 4 * n.proteins + 4 * n.carbohydrates + 9 * n.fat;
    assert.ok(Math.abs(m - k) / k <= 0.2, `${e.name}: ${k} kcal vs ${Math.round(m)} from macros`);
  }
});

test('everyday portions: the numbers people expect', () => {
  const f = (n) => commonFoodToFood(byName(n));
  const banana = f('Banana');
  assert.equal(`${banana.portion} ${banana.unit}`, '1 medium');
  assert.equal(banana.nutrition.calories, 105);
  assert.equal(f('Egg, large').nutrition.calories, 72);
  assert.equal(`${f('Egg, large').portion} ${f('Egg, large').unit}`, '1 large');
  assert.equal(f('White rice, cooked').nutrition.calories, 205);
  assert.equal(f('Peanut butter').nutrition.calories, 191);
  assert.equal(`${f('Chicken breast, cooked').portion} ${f('Chicken breast, cooked').unit}`, '3 oz');
  assert.equal(f('Avocado').portion, 0.5);
  assert.equal(f('Beer').unit, 'can');
  assert.equal(f('Banana').brand, 'USDA');
});

test('carbs exclude fiber, like USDA search results elsewhere in the app', () => {
  const e = byName('Black beans, cooked');
  const food = commonFoodToFood(e, 0);
  const g = e.servings[0].grams / 100;
  const expected = Math.max(e.per100g.carbohydrates * g - e.per100g.fiber * g, e.per100g.sugars * g);
  assert.ok(Math.abs(food.nutrition.carbohydrates - expected) < 0.05);
});

test("portions become alt units: '1 cup' of rice means rice's 158 g", () => {
  const rice = commonFoodToFood(byName('White rice, cooked'));
  const cup = rice.alt_units.find(a => a.abbr === 'cup');
  assert.equal(cup.grams, 158);
  // 2 cups of a food stored as 1 cup = factor 2; 100 g = 100/158 of a cup
  assert.equal(scaleFactor(1, 'cup', 2, 'cup', rice), 2);
  assert.ok(Math.abs(scaleFactor(1, 'cup', 100, 'g', rice) - 100 / 158) < 0.001);
  // half-cup labels give a per-cup weight
  const peas = commonFoodToFood(byName('Peas, green'));
  assert.equal(peas.alt_units.find(a => a.abbr === 'cup').grams, 160);
});

test('serving labels parse to amount + short unit', () => {
  assert.deepEqual(parseServingLabel('1 medium (7" to 7-7/8" long)'), { amount: 1, unit: 'medium' });
  assert.deepEqual(parseServingLabel('0.5 breast, bone and skin removed'), { amount: 0.5, unit: 'breast' });
  assert.deepEqual(parseServingLabel('1 cup, sliced'), { amount: 1, unit: 'cup, sliced' });
  assert.deepEqual(parseServingLabel('½ avocado'), { amount: 0.5, unit: 'avocado' });
  assert.deepEqual(parseServingLabel('2 tbsp'), { amount: 2, unit: 'tbsp' });
});

test('search: plain words find the obvious food first', () => {
  const first = (q) => searchCommonFoods(q, 1)[0]?.name;
  assert.equal(first('banana'), 'Banana');
  assert.equal(first('bananas'), 'Banana');
  assert.equal(first('eggs'), 'Egg, large');
  assert.equal(first('rice'), 'White rice, cooked');
  assert.equal(first('brown rice'), 'Brown rice, cooked');
  assert.equal(first('pb'), 'Peanut butter');
  assert.equal(first('greek yogurt'), 'Greek yogurt, plain nonfat');
  assert.equal(first('strawberry'), 'Strawberries');
  assert.equal(first('Coffee'), 'Coffee, black');
  assert.deepEqual(searchCommonFoods(''), []);
  assert.deepEqual(searchCommonFoods('zzqx'), []);
});

test('search scores: exact > prefix > partial; dishes the library lacks score low', () => {
  assert.equal(searchCommonFoodsScored('banana', 1)[0].score, 100);
  const sandwich = searchCommonFoodsScored('pastrami croissant sandwich', 1)[0];
  assert.ok(!sandwich || sandwich.score < 65, 'no strong match for a dish we do not carry');
});

test('food emoji: the dish wins over an ingredient; unknown → empty', () => {
  assert.equal(foodEmoji('Banana'), '🍌');
  assert.equal(foodEmoji('Meat and Pineapple Pizza'), '🍕');
  assert.equal(foodEmoji('Pastrami croissant sandwich'), '🥪');
  assert.equal(foodEmoji('Lipton pure leaf lemon iced tea in bottle'), '🍵');
  assert.equal(foodEmoji('Traditional Vietnamese Coffee'), '☕');
  assert.equal(foodEmoji('Ice cream sandwich'), '🍨');
  assert.equal(foodEmoji('Glazed Donut'), '🍩');
  assert.equal(foodEmoji('Cronut'), '🥐');
  assert.equal(foodEmoji('Mystery thing'), '');
  assert.equal(foodEmoji('anything', '🥝'), '🥝');   // a food's own icon wins
});
