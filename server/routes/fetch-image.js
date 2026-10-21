/**
 * GET /api/fetch-image?url=https://… — fetch ONE public image for the
 * signed-in user (fork addition). Used when an image is pasted into the
 * Trace chat as a link (iOS often pastes Safari images as their URL).
 *
 * Unlike /api/proxy (no login, short host allowlist), this needs a login,
 * blocks private/loopback/cloud-metadata addresses (SSRF guard), follows at
 * most 3 redirects, and only returns images up to 8 MB.
 */
import { Router } from 'express';
import { wrap } from '../logger.js';
import { requireAuth } from '../middleware/auth.js';
import { fetchChecked, readBody } from '../lib/ssrf-guard.js';

const router = Router();
const MAX_BYTES = 8 * 1024 * 1024;

router.get('/', requireAuth, wrap(async (req, res) => {
  let url;
  try { url = new URL(String(req.query.url || '')); } catch { return res.status(400).json({ error: 'Not a link' }); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return res.status(400).json({ error: 'Not a web link' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchChecked(url.toString(), { signal: controller.signal, headers: { Accept: 'image/*' } },
      { allowPrivate: false, maxRedirects: 3 });
    if (!response.ok) return res.status(502).json({ error: `The image host returned ${response.status}` });
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/') || type.includes('svg')) return res.status(415).json({ error: "That link isn't an image" });
    const body = await readBody(response, MAX_BYTES);
    res.json({ mimeType: type, base64: body.toString('base64') });
  } catch (e) {
    res.status(400).json({ error: /abort/i.test(e?.message) ? 'The image took too long to load' : (e?.message || 'Could not load that image') });
  } finally {
    clearTimeout(timer);
  }
}));

export default router;
