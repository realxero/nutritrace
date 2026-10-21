// Fork: iPhone reminders skip what's already done today (same rules as Android).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReminders, IOS_ID_MIN, IOS_ID_MAX } from '../src/lib/reminder-plan.js';

const settings = {
  meals: { on: true, times: ['08:00', '12:00', '18:00'], names: ['Breakfast', 'Lunch', 'Dinner'] },
  water: { on: true, interval: 120, goalMl: 2000 },
  weighIn: { on: true, time: '07:00' },
};
const at = (h, m = 0) => { const d = new Date(2026, 9, 20, h, m); return d; };
const todays = (plan) => plan.filter(p => p.at.getDate() === 20);

test('nothing logged at 6 AM: all of today is planned', () => {
  const p = todays(planReminders({ now: at(6), settings, today: {} }));
  assert.equal(p.filter(x => x.kind === 'meal').length, 3);
  assert.equal(p.filter(x => x.kind === 'water').length, 7);   // 8,10,...,20
  assert.equal(p.filter(x => x.kind === 'weighin').length, 1);
});

test('a logged meal skips only its own reminder today', () => {
  const p = todays(planReminders({ now: at(6), settings, today: { loggedMeals: new Set([1]) } }));
  assert.deepEqual(p.filter(x => x.kind === 'meal').map(x => x.body), ['Time to log your Breakfast!', 'Time to log your Dinner!']);
});

test('water goal met: no more water today, still tomorrow', () => {
  const all = planReminders({ now: at(6), settings, today: { waterMl: 2100 } });
  assert.equal(todays(all).filter(x => x.kind === 'water').length, 0);
  assert.ok(all.some(x => x.kind === 'water' && x.at.getDate() === 21));
});

test('weighed today: no weigh-in today, still tomorrow', () => {
  const all = planReminders({ now: at(6), settings, today: { weighed: true } });
  assert.equal(todays(all).filter(x => x.kind === 'weighin').length, 0);
  assert.ok(all.some(x => x.kind === 'weighin' && x.at.getDate() === 21));
});

test('day marked complete: no meal or water reminders left today', () => {
  const p = todays(planReminders({ now: at(6), settings, today: { completed: true } }));
  assert.equal(p.filter(x => x.kind !== 'weighin').length, 0);
});

test('past times today are not scheduled', () => {
  const p = todays(planReminders({ now: at(13), settings, today: {} }));
  assert.deepEqual(p.filter(x => x.kind === 'meal').map(x => x.at.getHours()), [18]);
});

test('ids stay in range and unique; under the iOS 64-notification limit', () => {
  const p = planReminders({ now: at(0, 1), days: 3, settings: { ...settings, water: { on: true, interval: 15, goalMl: 0 } }, today: {} });
  assert.ok(p.length <= 56);
  assert.equal(new Set(p.map(x => x.id)).size, p.length);
  for (const x of p) assert.ok(x.id >= IOS_ID_MIN && x.id <= IOS_ID_MAX);
});

test('everything off: nothing planned', () => {
  assert.deepEqual(planReminders({ now: at(6), settings: {}, today: {} }), []);
});
