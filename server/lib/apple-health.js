/**
 * apple-health.js — Apple Health → wellness_data mapping (fork addition).
 *
 * Apple Health (HealthKit) has no web or cloud API: the data only lives on
 * the iPhone. So instead of an OAuth pull like Fitbit/Withings/Garmin, the
 * phone PUSHES to POST /api/v1/apple-health using one of two senders:
 *
 *   1. Health Auto Export (iOS app) → "REST API" automation, JSON format.
 *      Payload: { data: { metrics: [ { name, units, data: [ {date, qty, ...} ] } ] } }
 *      Works with "Aggregate Data: Days" (recommended) or raw samples; raw
 *      samples are rolled up per day here.
 *
 *   2. Apple Shortcuts (personal automation, "Get Contents of URL").
 *      Simple payload using NutriTrace's own metric keys:
 *        { date: "2026-10-18", metrics: { steps: 8123, resting_hr: 57 } }
 *      or an array of those under `days`.
 *
 * Everything is pure (no DB access) so it can be unit-tested; the route
 * does the writes. Output rows: { date, metric_type, value, metadata }.
 *
 * Dates: Health Auto Export stamps samples as "yyyy-MM-dd HH:mm:ss ±hhmm"
 * in the phone's wall-clock zone, so the first 10 chars ARE the local
 * calendar date. No timezone conversion needed (or wanted).
 */

const LB_TO_KG = 0.45359237;
const KJ_TO_KCAL = 1 / 4.184;
const MI_TO_KM = 1.609344;
const FLOZ_TO_ML = 29.5735;

/** NutriTrace metric keys accepted from the simple (Shortcuts) format. */
export const NT_METRICS = new Set([
  'steps', 'distance_km', 'floors', 'active_minutes', 'calories_out', 'active_calories',
  'avg_heart_rate', 'resting_hr', 'max_hr', 'hrv_daily_rmssd', 'spo2_avg', 'respiratory_rate',
  'weight_kg', 'body_fat_pct', 'lean_mass_kg', 'bmi', 'body_temperature', 'basal_metabolic_rate',
  'vo2_max', 'water_ml', 'blood_pressure_systolic', 'blood_pressure_diastolic',
  'sleep_duration_min', 'sleep_deep_min', 'sleep_light_min', 'sleep_rem_min', 'sleep_wake_min',
  'sleep_start_min', 'sleep_end_min',
]);

// How each Health Auto Export metric rolls up within a day and which NT
// key it lands on. `conv(qty, units)` normalizes units → NT's canonical
// unit (kg, km, kcal, ml, °C, %).
const HAE_MAP = {
  step_count:               { key: 'steps',                agg: 'sum' },
  walking_running_distance: { key: 'distance_km',          agg: 'sum',  conv: distKm },
  flights_climbed:          { key: 'floors',               agg: 'sum' },
  apple_exercise_time:      { key: 'active_minutes',       agg: 'sum' },
  active_energy:            { key: 'active_calories',      agg: 'sum',  conv: kcal },
  basal_energy_burned:      { key: '_basal_kcal',          agg: 'sum',  conv: kcal },
  resting_heart_rate:       { key: 'resting_hr',           agg: 'last' },
  // Apple's HRV is SDNN, not RMSSD. Stored under hrv_daily_rmssd so the
  // Wellness card + Readiness baseline light up; readiness compares you to
  // your own 30-day baseline, so the trend is still meaningful. Tagged in
  // metadata so it can be told apart later.
  heart_rate_variability:   { key: 'hrv_daily_rmssd',      agg: 'avg',  meta: { hrv_measure: 'sdnn' } },
  blood_oxygen_saturation:  { key: 'spo2_avg',             agg: 'avg',  conv: pct },
  respiratory_rate:         { key: 'respiratory_rate',     agg: 'avg' },
  weight_body_mass:         { key: 'weight_kg',            agg: 'last', conv: massKg },
  body_fat_percentage:      { key: 'body_fat_pct',         agg: 'last', conv: pct },
  lean_body_mass:           { key: 'lean_mass_kg',         agg: 'last', conv: massKg },
  body_mass_index:          { key: 'bmi',                  agg: 'last' },
  body_temperature:         { key: 'body_temperature',     agg: 'last', conv: tempC },
  vo2_max:                  { key: 'vo2_max',              agg: 'last' },
  dietary_water:            { key: 'water_ml',             agg: 'sum',  conv: waterMl },
};

// Sanity ranges in NT units. A value outside the range is dropped (not
// the whole payload — one bad sample shouldn't block a day's sync).
const RANGES = {
  steps: [0, 200000], distance_km: [0, 500], floors: [0, 2000], active_minutes: [0, 1440],
  calories_out: [300, 15000], active_calories: [0, 10000], avg_heart_rate: [20, 250],
  resting_hr: [20, 200], max_hr: [30, 250], hrv_daily_rmssd: [1, 500], spo2_avg: [50, 100],
  respiratory_rate: [3, 60], weight_kg: [10, 500], body_fat_pct: [1, 80], lean_mass_kg: [10, 300],
  bmi: [5, 100], body_temperature: [30, 45], basal_metabolic_rate: [400, 5000], vo2_max: [5, 100],
  water_ml: [0, 20000], blood_pressure_systolic: [50, 260], blood_pressure_diastolic: [30, 180],
  sleep_duration_min: [0, 1440], sleep_deep_min: [0, 1440], sleep_light_min: [0, 1440],
  sleep_rem_min: [0, 1440], sleep_wake_min: [0, 1440], sleep_start_min: [0, 1439], sleep_end_min: [0, 1439],
};

const ZERO_OK = new Set(['sleep_wake_min', 'sleep_start_min', 'sleep_end_min']);

function u(units) { return String(units || '').trim().toLowerCase(); }
function massKg(q, units) { return u(units) === 'lb' || u(units) === 'lbs' ? q * LB_TO_KG : q; }
function distKm(q, units) { return u(units) === 'mi' ? q * MI_TO_KM : u(units) === 'm' ? q / 1000 : q; }
function kcal(q, units) { return u(units) === 'kj' ? q * KJ_TO_KCAL : q; }
function tempC(q, units) { return u(units).includes('f') ? (q - 32) * 5 / 9 : q; }
function waterMl(q, units) {
  const x = u(units);
  if (x.startsWith('fl_oz') || x === 'oz') return q * FLOZ_TO_ML;
  if (x === 'l') return q * 1000;
  return q;
}
// HealthKit percentages arrive as 0–1 from some senders and 0–100 from others.
function pct(q) { return q > 0 && q <= 1 ? q * 100 : q; }

/** "2026-10-18 07:12:00 -0700" | "2026-10-18T07:12:00Z" | "2026-10-18" → "2026-10-18" */
export function localDate(s) {
  const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Wall-clock minutes after midnight from a HAE timestamp, or null. */
function wallMinutes(s) {
  const m = String(s || '').match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function normName(n) { return String(n || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(key, v) {
  if (key === 'steps' || key === 'floors' || key.endsWith('_min') || key.includes('calor')
      || key === 'water_ml' || key === 'basal_metabolic_rate' || key.startsWith('blood_pressure')
      || key === 'resting_hr' || key === 'max_hr' || key === 'avg_heart_rate') return Math.round(v);
  if (key === 'distance_km' || key === 'lean_mass_kg') return +v.toFixed(2);
  return +v.toFixed(1);
}

/** Per-day accumulator: key → { sum, n, last, lastAt, max } */
function makeDays() {
  const days = new Map();
  return {
    add(date, key, value, at, extraMeta) {
      if (!date || value == null) return;
      if (!days.has(date)) days.set(date, new Map());
      const d = days.get(date);
      const cur = d.get(key) || { sum: 0, n: 0, last: null, lastAt: '', max: -Infinity, meta: extraMeta || null };
      cur.sum += value; cur.n += 1; cur.max = Math.max(cur.max, value);
      if (String(at || '') >= cur.lastAt) { cur.last = value; cur.lastAt = String(at || ''); }
      d.set(key, cur);
    },
    days,
  };
}

/**
 * Sleep from Health Auto Export. Two shapes:
 *  - aggregated: { date, totalSleep|asleep, core, deep, rem, awake, inBed, sleepStart, sleepEnd } (hours)
 *  - raw:        { startDate, endDate, value: "Core"|"Deep"|"REM"|"Awake"|"Asleep"|"In Bed", qty } (hours)
 * Sleep is filed under the WAKE-UP date (Fitbit's dateOfSleep convention).
 */
function parseSleep(entries, out) {
  const raw = new Map(); // date → { core, deep, rem, awake, asleep, start, end }
  for (const e of entries || []) {
    if (e == null || typeof e !== 'object') continue;
    if (e.value != null && (e.startDate || e.endDate)) {
      const date = localDate(e.endDate || e.startDate);
      if (!date) continue;
      const hrs = num(e.qty) ?? ((Date.parse(String(e.endDate).replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'))
        - Date.parse(String(e.startDate).replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'))) / 3600000);
      if (!Number.isFinite(hrs) || hrs <= 0) continue;
      const r = raw.get(date) || { core: 0, deep: 0, rem: 0, awake: 0, asleep: 0, start: null, end: null };
      const stage = String(e.value).toLowerCase();
      if (stage.includes('core') || stage.includes('light')) r.core += hrs;
      else if (stage.includes('deep')) r.deep += hrs;
      else if (stage.includes('rem')) r.rem += hrs;
      else if (stage.includes('awake')) r.awake += hrs;
      else if (stage.includes('asleep')) r.asleep += hrs;
      if (!stage.includes('bed') && !stage.includes('awake')) {
        if (!r.start || String(e.startDate) < r.start) r.start = String(e.startDate);
        if (!r.end || String(e.endDate) > r.end) r.end = String(e.endDate);
      }
      raw.set(date, r);
      continue;
    }
    // Aggregated
    const date = localDate(e.sleepEnd || e.date);
    if (!date) continue;
    const core = num(e.core), deep = num(e.deep), rem = num(e.rem), awake = num(e.awake);
    let total = num(e.totalSleep) ?? num(e.asleep);
    if (!total && (core || deep || rem)) total = (core || 0) + (deep || 0) + (rem || 0);
    const set = (k, hrs) => { if (hrs != null && hrs > 0) out.push([date, k, hrs * 60]); };
    set('sleep_duration_min', total);
    set('sleep_light_min', core);
    set('sleep_deep_min', deep);
    set('sleep_rem_min', rem);
    if (awake != null) out.push([date, 'sleep_wake_min', awake * 60]);
    const s = wallMinutes(e.sleepStart), en = wallMinutes(e.sleepEnd);
    if (s != null) out.push([date, 'sleep_start_min', s]);
    if (en != null) out.push([date, 'sleep_end_min', en]);
  }
  for (const [date, r] of raw) {
    const staged = r.core + r.deep + r.rem;
    const total = staged > 0 ? staged : r.asleep;
    if (total > 0) out.push([date, 'sleep_duration_min', total * 60]);
    if (r.core) out.push([date, 'sleep_light_min', r.core * 60]);
    if (r.deep) out.push([date, 'sleep_deep_min', r.deep * 60]);
    if (r.rem) out.push([date, 'sleep_rem_min', r.rem * 60]);
    if (r.awake) out.push([date, 'sleep_wake_min', r.awake * 60]);
    const s = wallMinutes(r.start), en = wallMinutes(r.end);
    if (s != null) out.push([date, 'sleep_start_min', s]);
    if (en != null) out.push([date, 'sleep_end_min', en]);
  }
}

/** Health Auto Export JSON → per-day rows. */
function parseHae(metrics) {
  const acc = makeDays();
  const sleepRows = [];
  for (const m of metrics || []) {
    const name = normName(m?.name);
    const units = m?.units;
    const data = Array.isArray(m?.data) ? m.data : [];

    if (name === 'sleep_analysis') { parseSleep(data, sleepRows); continue; }

    if (name === 'heart_rate') {
      for (const d of data) {
        const date = localDate(d.date);
        const avg = num(d.Avg ?? d.avg ?? d.qty), max = num(d.Max ?? d.max);
        if (avg != null) acc.add(date, 'avg_heart_rate', avg, d.date);
        if (max != null) acc.add(date, '_max_hr', max, d.date);
      }
      continue;
    }

    if (name === 'blood_pressure') {
      for (const d of data) {
        const date = localDate(d.date);
        const sys = num(d.systolic), dia = num(d.diastolic);
        if (sys != null) acc.add(date, 'blood_pressure_systolic', sys, d.date);
        if (dia != null) acc.add(date, 'blood_pressure_diastolic', dia, d.date);
      }
      continue;
    }

    const spec = HAE_MAP[name];
    if (!spec) continue;
    for (const d of data) {
      const q = num(d.qty);
      if (q == null) continue;
      const v = spec.conv ? spec.conv(q, units) : q;
      acc.add(localDate(d.date), spec.key, v, d.date, spec.meta);
    }
  }

  const rows = [];
  for (const [date, keys] of acc.days) {
    const aggOf = k => {
      if (k === '_max_hr') return 'max';
      if (k.startsWith('blood_pressure')) return 'last';
      if (k === 'avg_heart_rate') return 'avg';
      const spec = Object.values(HAE_MAP).find(s => s.key === k);
      return spec?.agg || 'last';
    };
    let active = null, basal = null;
    for (const [k, c] of keys) {
      const agg = aggOf(k);
      const v = agg === 'sum' ? c.sum : agg === 'avg' ? c.sum / c.n : agg === 'max' ? c.max : c.last;
      if (k === '_basal_kcal') { basal = v; continue; }
      if (k === 'active_calories') active = v;
      rows.push({ date, metric_type: k === '_max_hr' ? 'max_hr' : k, value: v, metadata: c.meta || {} });
    }
    // Fitbit/Garmin semantics: calories_out = BMR + activity for the day.
    if (active != null && basal != null) rows.push({ date, metric_type: 'calories_out', value: active + basal, metadata: {} });
  }
  for (const [date, key, value] of sleepRows) rows.push({ date, metric_type: key, value, metadata: {} });
  return rows;
}

/** Simple Shortcuts format → rows. Accepts one day or { days: [...] }. */
function parseSimple(body) {
  const days = Array.isArray(body.days) ? body.days : [body];
  const rows = [];
  for (const d of days) {
    const date = localDate(d?.date);
    if (!date || !d.metrics || typeof d.metrics !== 'object') continue;
    for (const [k, raw] of Object.entries(d.metrics)) {
      if (!NT_METRICS.has(k)) continue;
      const v = num(raw);
      if (v == null) continue;
      rows.push({ date, metric_type: k, value: v, metadata: {} });
    }
  }
  return rows;
}

/**
 * Entry point. Returns { rows, dropped } where rows are range-checked and
 * rounded, ready to upsert, and dropped lists anything rejected.
 */
export function parseAppleHealthPayload(body) {
  if (!body || typeof body !== 'object') return { rows: [], dropped: [], format: null };
  let rows, format;
  if (Array.isArray(body?.data?.metrics)) { rows = parseHae(body.data.metrics); format = 'health-auto-export'; }
  else if (Array.isArray(body?.metrics)) { rows = parseHae(body.metrics); format = 'health-auto-export'; }
  else { rows = parseSimple(body); format = 'simple'; }

  const ok = [], dropped = [];
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) { dropped.push({ ...r, reason: 'bad-date' }); continue; }
    const v = round(r.metric_type, r.value);
    const [lo, hi] = RANGES[r.metric_type] || [-Infinity, Infinity];
    // missing != zero (upstream #206): never write a 0 for a real metric.
    if (!Number.isFinite(v) || v < lo || v > hi || (v === 0 && !ZERO_OK.has(r.metric_type))) {
      dropped.push({ ...r, reason: 'out-of-range' }); continue;
    }
    ok.push({ ...r, value: v });
  }
  return { rows: ok, dropped, format };
}
