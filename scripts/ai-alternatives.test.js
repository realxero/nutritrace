/** AI alternatives: prompt contents and defensive parsing (fork). No network. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAltPrompt, parseAlternatives, traceQuestion } from '../src/lib/ai-alternatives.js';

const item = { name: 'Coca-Cola', brand: 'Coca-Cola', quantity: 2, portion: 355, unit: 'ml', nutrition: { calories: 140, proteins: 0, carbohydrates: 39, fat: 0, sugars: 39 } };
const alt = (over = {}) => ({
  name: 'Coke Zero Sugar', brand: 'Coca-Cola', why: 'No sugar, no calories.',
  serving: { amount: 355, unit: 'ml', label: '1 can (355 ml)' },
  nutrition: { calories: 0, proteins: 0, carbohydrates: 0, fat: 0, sugars: 0, sodium: 40 },
  source: 'label', confidence: 'high', ...over,
});
// normalizeEstimate rejects 0 kcal, so a zero-calorie drink is sent as the AI would: 1 kcal rounding
const zero = (over = {}) => alt({ nutrition: { calories: 1, proteins: 0, carbohydrates: 0, fat: 0, sugars: 0 }, ...over });

test('the prompt carries the food, the goal, what is left and what to avoid', () => {
  const p = buildAltPrompt({ item, focusLabel: 'losing weight', remaining: { calories: 420, protein: 38 }, avoid: ['Diet Rite', 'Tab'], country: 'US' });
  assert.match(p, /Logged food: Coca-Cola \(Coca-Cola\)/);
  assert.match(p, /2 × 355 ml/);
  assert.match(p, /140 kcal/);
  assert.match(p, /Goal: losing weight/);
  assert.match(p, /Calories left today: about 420 kcal/);
  assert.match(p, /Protein still to go today: about 38 g/);
  assert.match(p, /Avoid \(never suggest\): Diet Rite, Tab/);
  assert.match(p, /Shopping in: US/);
});

test('parses a clean reply and marks only looked-up products as checked', () => {
  const r = parseAlternatives(JSON.stringify({ alternatives: [zero(), zero({ name: 'Pepsi Zero Sugar', brand: 'Pepsi', source: 'estimate' })] }), { originalName: 'Coca-Cola' });
  assert.equal(r.length, 2);
  assert.equal(r[0].checked, true);
  assert.equal(r[1].checked, false);
  assert.equal(r[0].estimate.unit, 'ml');
  assert.equal(r[0].why, 'No sugar, no calories.');
});

test('tolerates code fences and chatter around the JSON', () => {
  const text = 'Sure!\n```json\n' + JSON.stringify({ alternatives: [zero()] }) + '\n```\nHope that helps.';
  assert.equal(parseAlternatives(text).length, 1);
});

test('drops invalid entries, the original food, duplicates and avoided foods', () => {
  const reply = JSON.stringify({ alternatives: [
    zero({ name: 'Coca-Cola', brand: 'Coca-Cola' }),                              // the original
    alt({ nutrition: { calories: 0 } }),                                           // no calories → rejected
    alt({ nutrition: { calories: 5000 }, serving: { amount: 10, unit: 'g' } }),    // impossible density
    zero({ name: 'Diet Rite', brand: '' }),                                        // avoided
    zero({ name: 'Coke Zero Sugar' }),
    zero({ name: 'Coke Zero Sugar' }),                                             // duplicate
  ] });
  const r = parseAlternatives(reply, { avoid: ['diet rite'], originalName: 'Coca-Cola' });
  assert.deepEqual(r.map(x => x.estimate.name), ['Coke Zero Sugar']);
});

test('no usable option, or no JSON at all, is a clear error', () => {
  assert.throws(() => parseAlternatives(JSON.stringify({ alternatives: [] })), /usable option/);
  assert.throws(() => parseAlternatives('I cannot help with that.'), /didn't return/);
  assert.throws(() => parseAlternatives('{"alternatives": [{"name": "x"}]}'), /usable option/);
});

test('caps the list at four', () => {
  const many = Array.from({ length: 8 }, (_, i) => zero({ name: `Option ${i}` }));
  assert.equal(parseAlternatives(JSON.stringify({ alternatives: many })).length, 4);
});

test('the Trace question names the food and the goal', () => {
  const q = traceQuestion({ item, focusLabel: 'getting more protein' });
  assert.match(q, /Coca-Cola/);
  assert.match(q, /getting more protein/);
  assert.equal(traceQuestion({ item: { name: 'Bagel', brand: 'USDA' } }).includes('USDA'), false);
  // must never look like "I had X and Y" to Trace's multi-food logging check
  assert.doesNotMatch(q, /\b(log|logged|had|ate|eaten|drank|add|track)\b/i);
});
