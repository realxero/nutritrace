/**
 * reminder-plan.js — decides which reminders to schedule (fork addition).
 * Pure: no app imports, so scripts/reminder-plan.test.js can test it.
 *
 * iOS can't run a check every 15 minutes the way Android's ReminderWorker
 * does. Instead the app re-plans the next few days of reminders whenever it
 * opens, returns to the foreground, or the diary changes, and leaves out
 * anything today that's already done — the same rules as Android:
 *   - meal reminder: skipped once that meal has something logged
 *   - water: skipped once today's water goal is met
 *   - weigh-in: skipped once weight is logged today (diary or synced)
 *   - a day marked complete: no more meal/water reminders that day
 * Future days can't be checked yet; they're re-planned on the next open.
 */

export const IOS_ID_MIN = 6000;
export const IOS_ID_MAX = 6399;
const WATER_START = 8 * 60, WATER_END = 22 * 60;

function _hm(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

function _at(dayStart, minutes) {
  const d = new Date(dayStart);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/**
 * @param {object} p
 * @param {Date}   p.now
 * @param {number} [p.days=3]          days to plan, today included
 * @param {object} p.settings          { meals:{on,times,names}, water:{on,interval,goalMl}, weighIn:{on,time} }
 * @param {object} p.today             { loggedMeals:Set<number>, completed:bool, waterMl:number, weighed:bool }
 * @returns {{id:number, at:Date, title:string, body:string, kind:string}[]}
 */
export function planReminders({ now, days = 3, settings, today }) {
  const out = [];
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const t = today || {};
  const logged = t.loggedMeals instanceof Set ? t.loggedMeals : new Set(t.loggedMeals || []);
  for (let d = 0; d < days; d++) {
    const day = new Date(start); day.setDate(start.getDate() + d);
    const isToday = d === 0;
    const base = IOS_ID_MIN + d * 100;
    const s = settings || {};

    if (s.meals?.on) {
      (s.meals.times || []).forEach((time, i) => {
        const min = _hm(time);
        if (min == null || i > 19) return;
        if (isToday && (logged.has(i) || t.completed)) return;
        const at = _at(day, min);
        if (at <= now) return;
        const name = (s.meals.names || [])[i] || 'meal';
        out.push({ id: base + i, at, kind: 'meal', title: '🍽️ Meal Reminder', body: `Time to log your ${name}!` });
      });
    }

    if (s.water?.on) {
      const interval = Math.max(15, Number(s.water.interval) || 120);
      const goalMet = isToday && Number(s.water.goalMl) > 0 && Number(t.waterMl) >= Number(s.water.goalMl);
      if (!(isToday && (goalMet || t.completed))) {
        let k = 0;
        for (let min = WATER_START; min < WATER_END && k < 40; min += interval, k++) {
          const at = _at(day, min);
          if (at <= now) continue;
          out.push({ id: base + 20 + k, at, kind: 'water', title: '💧 Hydration Reminder', body: 'Time to drink some water! Stay hydrated.' });
        }
      }
    }

    if (s.weighIn?.on) {
      const min = _hm(s.weighIn.time || '07:00');
      if (min != null && !(isToday && t.weighed)) {
        const at = _at(day, min);
        if (at > now) out.push({ id: base + 60, at, kind: 'weighin', title: '⚖️ Weigh-in Reminder', body: 'Time to step on the scale!' });
      }
    }
  }
  // iOS keeps at most 64 pending notifications per app; stay well under.
  return out.sort((a, b) => a.at - b.at).slice(0, 56);
}
