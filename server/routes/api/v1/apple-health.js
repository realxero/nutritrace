/**
 * POST /api/v1/apple-health — ingest Apple Health data pushed from an
 * iPhone (fork addition). Apple Health has no server-side API, so the
 * phone is the sender: Health Auto Export's REST API automation, or an
 * Apple Shortcuts personal automation. See server/lib/apple-health.js for
 * both wire formats.
 *
 * Auth: Bearer token with the `write:apple-health` scope (create one in
 * Settings → API tokens).
 *
 * Storage: wellness_data with source='apple_health', upserted per
 * (user, date, metric). Re-posting a day replaces that day's values, so
 * senders should post FULL-DAY aggregates (Health Auto Export:
 * "Aggregate Data" on, period "Days").
 *
 * Side effects match the other wellness integrations:
 *   - weight readings mirror into diary Body Stats when the user's
 *     mirrorWellnessWeight toggle is on;
 *   - today's Readiness / Resilience snapshot is refreshed.
 */
import { Router } from 'express';
import db from '../../../db.js';
import { wrap, logger } from '../../../logger.js';
import { requireScope } from '../../../middleware/bearer-auth.js';
import { parseAppleHealthPayload } from '../../../lib/apple-health.js';
import { mirrorWeightToBodyStats } from '../../../lib/wellness-mirror.js';
import { snapshotScores } from '../../../lib/wellness-scores.js';

const router = Router();

router.post('/', requireScope('write:apple-health'), wrap((req, res) => {
  const userId = req.apiUser.id;
  const u = (userId === 0 || userId == null) ? null : userId;
  const wellnessUid = u ?? 0;

  const { rows, dropped, format } = parseAppleHealthPayload(req.body);
  if (rows.length === 0) {
    return res.status(400).json({
      error: 'No usable metrics in payload',
      code: 'empty',
      format,
      dropped: dropped.length,
    });
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
      upsert.run(wellnessUid, r.date, r.metric_type, r.value, JSON.stringify({ ...r.metadata, format }));
      dates.add(r.date);
    }
  })();

  for (const r of rows) {
    if (r.metric_type === 'weight_kg') mirrorWeightToBodyStats(u, r.date, r.value);
  }

  // Readiness/Resilience only snapshot for today (same as Fitbit/Garmin).
  const today = new Date().toISOString().slice(0, 10);
  if (dates.has(today) && u != null) {
    try { snapshotScores(u, today); } catch (e) { logger.warn(`[apple-health] snapshot failed: ${e?.message}`); }
  }

  logger.info(`[apple-health] user=${wellnessUid} format=${format} rows=${rows.length} dropped=${dropped.length} days=${dates.size}`);
  res.status(201).json({
    ok: true,
    format,
    stored: rows.length,
    days: [...dates].sort(),
    dropped: dropped.map(d => ({ date: d.date, metric_type: d.metric_type, reason: d.reason })),
  });
}));

export default router;
