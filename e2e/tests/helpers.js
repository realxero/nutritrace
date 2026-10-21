import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixture = (name) => path.join(here, '..', 'fixtures', name);

/** Fail the test on any uncaught page error; collect console errors. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Network noise from features the test server doesn't have (update
    // checks, OFF images, fonts) isn't an app bug.
    if (/Failed to load resource|net::|ERR_|favicon|update-check|status of 40[34]/i.test(t)) return;
    errors.push(`console: ${t}`);
  });
  return errors;
}

/** Answer Open Food Facts searches (through the server's /api/proxy) from a fixture. */
export async function mockOff(page) {
  const products = JSON.parse(fs.readFileSync(fixture('off-search.json'), 'utf8'));
  await page.route(/\/api\/proxy\?/, async route => {
    const url = decodeURIComponent(route.request().url());
    if (/search|cgi\/search|\/api\/v2\/search/.test(url)) {
      const q = (url.match(/[?&](?:q|search_terms)=([^&]+)/) || [])[1] || '';
      const hits = products.filter(p => q.toLowerCase().split(/[+ ]/).some(w => w && p.product_name.toLowerCase().includes(w)));
      return route.fulfill({ json: { count: hits.length, products: hits } });
    }
    return route.fulfill({ json: { status: 0, product: null } });
  });
}

/** Fake Web Speech API: "hears" window.__speech word by word while active. */
export async function fakeSpeech(page) {
  await page.addInitScript(() => {
    class FakeRecognition {
      constructor() { this.continuous = false; this.interimResults = false; this.lang = 'en-US'; this._t = null; this._heard = ''; }
      start() {
        const words = String(window.__speech || '').split(/\s+/).filter(Boolean);
        let i = 0;
        this._t = setInterval(() => {
          if (i >= words.length) return;
          this._heard = words.slice(0, ++i).join(' ');
          this.onresult?.({ results: [[{ transcript: this._heard }]] });
        }, 25);
      }
      stop() { clearInterval(this._t); setTimeout(() => this.onend?.(), 10); }
      abort() { clearInterval(this._t); setTimeout(() => this.onend?.(), 10); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
  });
}

/** Hold the Trace button like a finger: down, wait, up. */
export async function holdTrace(page, holdMs, whileHeld) {
  const fab = page.locator('.ai-fab');
  await expect(fab).toBeVisible();
  const box = await fab.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  if (whileHeld) await whileHeld();
  await page.mouse.up();
}

/** No element makes the page wider than the screen. */
export async function expectNoHorizontalOverflow(page, label) {
  const { scrollW, innerW, culprit } = await page.evaluate(() => {
    const innerW = window.innerWidth;
    let culprit = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerW + 1 && getComputedStyle(el).position !== 'fixed') {
        // ignore things inside horizontal scrollers (chip rows etc.)
        let p = el.parentElement, scroller = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = true; break; } p = p.parentElement; }
        if (!scroller) { culprit = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)}`; break; }
      }
    }
    return { scrollW: document.documentElement.scrollWidth, innerW, culprit };
  });
  expect(culprit, `${label}: element wider than the screen`).toBeNull();
  expect(scrollW, `${label}: page scrolls sideways`).toBeLessThanOrEqual(innerW + 1);
}

export async function gotoDiary(page) {
  await page.goto('/#/');
  await expect(page.locator('.meal-photo-btn').first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Text must fit its box: catches labels squashed to one letter per line
 * ("M o d e l") and text spilling out of cards or pop-up messages. Unlike
 * the overflow check, this includes fixed elements (toasts, sheets).
 */
export async function expectTextFits(page, label) {
  const problems = await page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (own.length < 4) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) continue;
      if (el.closest('select, option, svg, [aria-hidden="true"], .material-symbols-rounded')) continue;
      const fontPx = parseFloat(cs.fontSize) || 14;
      const longestWord = Math.max(...own.split(/\s+/).map(w => w.length));
      const name = `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} "${own.slice(0, 30)}"`;
      // squashed: narrower than ~2 characters while holding a real word
      if (longestWord >= 4 && r.width < fontPx * 1.6) out.push(`squashed ${Math.round(r.width)}px: ${name}`);
      // text wider than its own box (spills out, e.g. a no-wrap toast)
      if (cs.display !== 'inline' && cs.overflowX === 'visible' && cs.whiteSpace.startsWith('nowrap') === false
          && el.scrollWidth > el.clientWidth + 8 && el.clientWidth > 0) {
        out.push(`spills out (${el.scrollWidth}px text in ${el.clientWidth}px box): ${name}`);
      } else if (cs.whiteSpace.startsWith('nowrap') && cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis'
          && el.scrollWidth > el.clientWidth + 8 && el.clientWidth > 0) {
        out.push(`no-wrap text spills out (${el.scrollWidth}px in ${el.clientWidth}px): ${name}`);
      }
      // runs past the right edge of the screen
      if (r.right > vw + 2 && cs.overflowX === 'visible') {
        let p = el.parentElement, clipped = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') { clipped = true; break; } p = p.parentElement; }
        if (!clipped) out.push(`off screen (right=${Math.round(r.right)}): ${name}`);
      }
    }
    return out.slice(0, 10);
  });
  expect(problems, `${label}: text doesn't fit`).toEqual([]);
}
