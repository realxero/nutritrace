/**
 * Fork features: emoji resolution (brands, categories, group words,
 * remembered choices), recent/frequent foods, and the weekly check-in maths.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveFoodEmoji, emojiFromCategories, emojiAtLogTime, setFoodOverrides, overrideKey, resolveFoodName,
} from '../src/lib/food-emoji.js';
import { recentAndFrequent } from '../src/lib/recent-foods.js';
import { summarizeWeek } from '../src/lib/weekly-checkin.js';

test.beforeEach(() => setFoodOverrides({}));

test('brands map to their emoji', () => {
  assert.equal(resolveFoodEmoji({ name: 'Skittles Original' }), '🍬');
  assert.equal(resolveFoodEmoji({ name: 'Snickers' }), '🍫');
  assert.equal(resolveFoodEmoji({ name: 'Doritos Nacho Cheese' }), '🥔');
  assert.equal(resolveFoodEmoji({ name: 'Cheez-It Original' }), '🧀');
  assert.equal(resolveFoodEmoji({ name: 'Mystery', brand: 'Pepsi' }), '🥤');
});

test('Open Food Facts categories cover unlisted branded items', () => {
  assert.equal(resolveFoodEmoji({ name: 'Zorbo', offCategories: ['en:snacks', 'en:sweet-snacks', 'en:candies'] }), '🍬');
  assert.equal(resolveFoodEmoji({ name: 'Zorbo', offCategories: ['en:snacks', 'en:salty-snacks', 'en:chips-and-fries'] }), '🥔');
  assert.equal(resolveFoodEmoji({ name: 'Zorbo', offCategories: ['en:beverages', 'en:carbonated-drinks', 'en:sodas'] }), '🥤');
  assert.equal(emojiFromCategories('Candy'), '🍬');           // USDA branded category
  assert.equal(emojiFromCategories([]), '');
});

test('the most specific (last) category wins', () => {
  assert.equal(emojiFromCategories(['en:beverages', 'en:sodas']), '🥤');
  assert.equal(emojiFromCategories(['en:sodas', 'en:snacks', 'en:chips-and-fries']), '🥔');
});

test('group words cover foods with no brand or category', () => {
  assert.equal(resolveFoodEmoji({ name: 'Rice bowl' }) !== '', true);
  assert.equal(resolveFoodEmoji({ name: 'Homemade granola' }), '🥣');
  assert.equal(resolveFoodEmoji({ name: 'Whole grain crackers' }), '🧀');
  assert.equal(resolveFoodEmoji({ name: 'Açaí bowl' }), '🥣');
});

test('unrelated words do not false-match brand keys', () => {
  assert.equal(resolveFoodEmoji({ name: 'Bang bang shrimp' }), '🍤');
  assert.equal(resolveFoodEmoji({ name: 'zzzz qqqq' }), '');
});

test('a remembered choice beats everything and survives a rename', () => {
  setFoodOverrides({ [overrideKey('Skittles Original', '')]: { emoji: '🌈', name: 'Rainbow candy' } });
  assert.equal(resolveFoodEmoji({ name: 'Skittles Original' }), '🌈');
  assert.equal(resolveFoodEmoji({ name: 'Rainbow candy', origName: 'Skittles Original' }), '🌈');
  assert.equal(resolveFoodName('Skittles Original', ''), 'Rainbow candy');
});

test('log-time emoji comes only from brand or category, never a name guess', () => {
  assert.equal(emojiAtLogTime({ name: 'Zorbo', offCategories: ['en:candies'] }), '🍬');
  assert.equal(emojiAtLogTime({ name: 'Granola' }), '');
});

test('recent and frequent', () => {
  const foods = [
    { id: 1, name: 'A', last_used_at: '2026-10-20', usage_count: 5 },
    { id: 2, name: 'B', last_used_at: '2026-10-21', usage_count: 1 },
    { id: 3, name: 'C', usage_count: 9 },
    { id: 4, name: 'D', last_used_at: '2026-10-19', usage_count: 2 },
  ];
  const r = recentAndFrequent(foods, 2);
  assert.deepEqual(r.recent.map(f => f.name), ['B', 'A']);
  assert.deepEqual(r.frequent.map(f => f.name), ['C', 'D']);
  assert.deepEqual(recentAndFrequent([], 6), { recent: [], frequent: [] });
});

test('weekly check-in: matching, heavier, lighter, sparse, building', () => {
  const week = (kcal) => Array(7).fill(kcal);
  const base = { ready: true, tdee: 2500, trendKgPerWeek: -0.45, daysAvailable: 30, daysRequired: 21 };
  // 2000 kcal vs 2500 burn = -500/day ≈ -0.45 kg/week
  const m = summarizeWeek({ dayCalories: week(2000), adaptive: base });
  assert.equal(m.expectedKgPerWeek, -0.45);
  assert.equal(m.verdict, 'match');
  assert.equal(summarizeWeek({ dayCalories: week(2000), adaptive: { ...base, trendKgPerWeek: 0.3 } }).verdict, 'heavier');
  assert.equal(summarizeWeek({ dayCalories: week(2000), adaptive: { ...base, trendKgPerWeek: -1.2 } }).verdict, 'lighter');
  assert.equal(summarizeWeek({ dayCalories: [2000, 2100, null, null, null, null, null], adaptive: base }).verdict, 'sparse');
  assert.equal(summarizeWeek({ dayCalories: week(2000), adaptive: { ready: false, daysAvailable: 5, daysRequired: 21 } }).verdict, 'building');
  assert.equal(summarizeWeek({ dayCalories: [], adaptive: base }).verdict, 'empty');
  // days with nothing logged are left out of the average, not counted as 0
  assert.equal(summarizeWeek({ dayCalories: [2000, 2000, 2000, 2000, null, null, null], adaptive: base }).avgIntake, 2000);
});
