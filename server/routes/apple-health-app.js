/**
 * POST /api/wellness/apple-health — Apple Health days pushed by the NutriTrace
 * iOS app itself (fork addition). Same payload and storage as the
 * token-based /api/v1/apple-health, but authenticated with the user's normal
 * login, so the app doesn't need an API token pasted into it.
 *
 * Body: { days: [ { date: "YYYY-MM-DD", metrics: { steps: 8123, ... } } ] }
 */
import { Router } from 'express';
import db from '../db.js';
import { wrap, logger } from '../logger.js';
import { requireAuth, userMgmtActive } from '../middleware/auth.js';
import { parseAppleHealthPayload } from '../lib/apple-health.js';
import { mirrorWeightToBodyStats } from '../lib/wellness-mirror.js';
import { snapshotScores } from '../lib/wellness-scores.js';

const router = Router();

router.post('/', requireAuth, wrap((req, res) => {
  const u = userMgmtActive() ? req.user.id : null;   // null = single-user mode
  const wellnessUid = u ?? 0;

  const { rows, dropped, format } = parseAppleHealthPayload(req.body);
  if (rows.length === 0) {
    return res.status(400).json({ error: 'No usable metrics in payload', code: 'empty', format, dropped: dropped.length });
  }

  const upsert = db.prepare(`
    INSERT INTO wellness_data (user_id, date, source, metric_type, value, metadata, synced_at)
    VALUES (?, ?, 'apple_health', ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, date, source, metric_type)
    DO UPDATE SET value = excluded.value, metadata = excluded.metadata, synced_at = excluded.synced_at
  `);
  const dates = new Set();
  db.transaction(() => {
    for (const r of rows) {
      upsert.run(wellnessUid, r.date, r.metric_type, r.value, JSON.stringify({ ...r.metadata, format, via: 'ios-app' }));
      dates.add(r.date);
    }
  })();

  for (const r of rows) {
    if (r.metric_type === 'weight_kg') mirrorWeightToBodyStats(u, r.date, r.value);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (dates.has(today) && u != null) {
    try { snapshotScores(u, today); } catch (e) { logger.warn(`[apple-health-app] snapshot failed: ${e?.message}`); }
  }

  logger.info(`[apple-health-app] user=${wellnessUid} rows=${rows.length} dropped=${dropped.length} days=${dates.size}`);
  res.status(201).json({ ok: true, stored: rows.length, days: [...dates].sort(),
    dropped: dropped.map(d => ({ date: d.date, metric_type: d.metric_type, reason: d.reason })) });
}));

export default router;
