/**
 * apple-health-native.js — Apple Health sync for the NutriTrace iOS app
 * (fork addition). The native HealthSync plugin
 * (plugins/healthsync) reads HealthKit; this posts the days to the
 * server's /api/wellness/apple-health with the user's normal login.
 *
 * Syncs when the app opens or comes back to the foreground (at most every
 * 15 minutes), and on demand from Settings → Wellness → Apple Health.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNative, getNativeMode, getServerUrl, getAuthToken, apiUrl } from './platform.js';

export const isIOSApp = isNative && Capacitor.getPlatform() === 'ios';
const HealthSync = isIOSApp ? registerPlugin('HealthSync') : null;

const LAST_KEY = 'nt:appleHealthLastSync';
const MIN_GAP_MS = 15 * 60 * 1000;

export function lastSyncAt() {
  try { const v = localStorage.getItem(LAST_KEY); return v ? new Date(v) : null; } catch { return null; }
}

export async function healthAvailable() {
  if (!HealthSync) return false;
  try { return !!(await HealthSync.isAvailable()).available; } catch { return false; }
}

/** Shows the Health permission sheet. Throws a readable message on failure. */
export async function connectAppleHealth() {
  if (!HealthSync) throw new Error('Apple Health is only available in the iOS app.');
  try {
    await HealthSync.requestAuthorization();
  } catch (e) {
    const msg = e?.message || String(e);
    if (/entitlement/i.test(msg)) {
      throw new Error('This install of the app is missing Apple Health permission. Reinstall it through LiveContainer, or a build signed with a paid developer account.');
    }
    throw new Error(msg);
  }
}

/**
 * Read the last `days` days and send them to the server.
 * Returns { stored, days } or throws.
 */
export async function syncAppleHealth({ days = 7 } = {}) {
  if (!HealthSync) throw new Error('Apple Health is only available in the iOS app.');
  if (getNativeMode() !== 'server' || !getServerUrl()) {
    throw new Error('Connect the app to your NutriTrace server first (Settings → Sync).');
  }
  const res = await HealthSync.readDays({ days });
  const list = (res?.days || []).filter(d => d && d.date && d.metrics && Object.keys(d.metrics).length);
  if (!list.length) {
    throw new Error('No Apple Health data found. Check Settings → Health → Data Access & Devices → NutriTrace and turn the categories on.');
  }
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(apiUrl('/api/wellness/apple-health'), {
    method: 'POST', headers, credentials: 'include', body: JSON.stringify({ days: list }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Server error ${r.status}`);
  try { localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch {}
  try { window.dispatchEvent(new CustomEvent('nt:apple-health-synced', { detail: body })); } catch {}
  return { stored: body.stored || 0, days: body.days || [] };
}

let _syncing = false;
/** Quiet background sync: skips if recent, never shows errors. */
export async function maybeSyncAppleHealth(enabled) {
  if (!HealthSync || !enabled || _syncing) return;
  const last = lastSyncAt();
  if (last && Date.now() - last.getTime() < MIN_GAP_MS) return;
  _syncing = true;
  try { await syncAppleHealth({ days: last ? 3 : 14 }); }
  catch (e) { console.warn('[apple-health] background sync skipped:', e?.message || e); }
  finally { _syncing = false; }
}

/** Call once at app start: syncs now and whenever the app returns to the foreground. */
export async function startAppleHealthAutoSync(isEnabled) {
  if (!HealthSync) return;
  maybeSyncAppleHealth(isEnabled());
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', ({ isActive }) => { if (isActive) maybeSyncAppleHealth(isEnabled()); });
  } catch {}
}
