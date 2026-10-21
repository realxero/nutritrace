/**
 * ios-reminders.js — schedules iPhone reminders from reminder-plan.js
 * (fork addition). Re-planned on app open, on return to the foreground,
 * and (debounced) whenever today's diary changes.
 */
import { Capacitor } from '@capacitor/core';
import { planReminders, IOS_ID_MIN, IOS_ID_MAX } from './reminder-plan.js';

export const isIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

function _localDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function _todayState() {
  const state = { loggedMeals: new Set(), completed: false, waterMl: 0, weighed: false };
  try {
    const { dbGetDiaryDate, dbGetWellnessByDate } = await import('./db-native.js');
    const today = _localDate();
    const row = await dbGetDiaryDate(today);
    if (row) {
      for (const it of row.items || []) state.loggedMeals.add(Number(it.meal) || 0);
      state.completed = !!row.completed_at;
      state.waterMl = (row.water || []).reduce((s, w) => s + (Number(w.amount) || 0), 0);
      if (Number(row.body_stats?.weight) > 0) state.weighed = true;
    }
    if (!state.weighed) {
      const w = await dbGetWellnessByDate(today).catch(() => null);
      if (w && Number(w.weight_kg) > 0) state.weighed = true;
    }
  } catch (e) {
    console.warn('[ios-reminders] could not read today:', e?.message || e);
  }
  return state;
}

async function _settings() {
  const { DB } = await import('./db.js');
  const g = (k, d) => { try { const v = DB.getSetting(k, d); return v ?? d; } catch { return d; } };
  return {
    meals:   { on: !!g('notifMealReminders', false), times: g('notifMealTimes', ['08:00', '12:00', '18:00']), names: g('mealNames', ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) },
    water:   { on: !!g('notifWaterReminders', false), interval: Number(g('notifWaterInterval', 120)), goalMl: Number(g('waterGoalMl', 0)) },
    weighIn: { on: !!g('notifWeighIn', false), time: g('notifWeighInTime', '07:00') },
    master:  g('notifLocalEnabled', true) !== false,
  };
}

let _running = null, _again = false;
/** Cancel this module's pending reminders and schedule a fresh plan. */
export async function refreshIosReminders() {
  if (!isIOS) return;
  if (_running) { _again = true; return _running; }
  _running = (async () => {
    try {
      const { LocalNotifications: LN } = await import('@capacitor/local-notifications');
      const perm = await LN.checkPermissions().catch(() => ({ display: 'denied' }));
      const pending = await LN.getPending().catch(() => ({ notifications: [] }));
      const mine = (pending.notifications || []).filter(n => n.id >= IOS_ID_MIN && n.id <= IOS_ID_MAX);
      // Also clear the older repeating ones (fork.8 scheduled these on iOS).
      const legacy = (pending.notifications || []).filter(n => (n.id >= 1000 && n.id < 3000) || n.id === 4000);
      const drop = [...mine, ...legacy].map(n => ({ id: n.id }));
      if (drop.length) await LN.cancel({ notifications: drop });

      const settings = await _settings();
      if (!settings.master || perm.display !== 'granted') return;
      const plan = planReminders({ now: new Date(), days: 3, settings, today: await _todayState() });
      if (plan.length) {
        await LN.schedule({ notifications: plan.map(p => ({
          id: p.id, title: p.title, body: p.body, schedule: { at: p.at, allowWhileIdle: true },
        })) });
      }
      console.log(`[ios-reminders] planned ${plan.length} reminder(s)`);
    } catch (e) {
      console.warn('[ios-reminders] refresh failed:', e?.message || e);
    }
  })();
  try { await _running; } finally {
    _running = null;
    if (_again) { _again = false; refreshIosReminders(); }
  }
}

let _debounce = null;
function _soon() { clearTimeout(_debounce); _debounce = setTimeout(refreshIosReminders, 1500); }

/** Call once at startup. */
export async function startIosReminders() {
  if (!isIOS) return;
  refreshIosReminders();
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', ({ isActive }) => { if (isActive) refreshIosReminders(); });
  } catch {}
  try {
    const { currentEntry } = await import('../stores/diary.js');
    let first = true;
    currentEntry.subscribe(() => { if (first) { first = false; return; } _soon(); });
  } catch {}
}
