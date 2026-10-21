// Every settings page on an iPhone-sized screen: no squashed labels, no text
// running off screen, no sideways scrolling, no errors.
import { test, expect } from '@playwright/test';
import { watchErrors, expectNoHorizontalOverflow, expectTextFits, fakeSpeech, holdTrace } from './helpers.js';

const PAGES = ['ai', 'apiTokens', 'appearance', 'authentication', 'backup', 'bodyStats', 'categories',
  'connectedServices', 'customUnits', 'diary', 'email', 'foods', 'goals', 'helpImprove', 'importExport',
  'notifications', 'nutrients', 'regional', 'serverConnection', 'sharing', 'statistics', 'support',
  'updates', 'users', 'water', 'webhooks', 'wellness'];

test('settings pages: text fits and nothing scrolls sideways', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const failures = [];
  for (const p of PAGES) {
    await page.goto(`/#/settings/${p}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    // check the whole page, not just the first screen
    const h = await page.evaluate(() => document.scrollingElement.scrollHeight);
    for (let y = 0; y < Math.min(h, 6000); y += 700) {
      await page.evaluate(y => { (document.querySelector('.page-transition') || document.scrollingElement).scrollTo(0, y); }, y);
      await page.waitForTimeout(80);
      try { await expectTextFits(page, p); await expectNoHorizontalOverflow(page, p); }
      catch (e) { failures.push(`${p} @${y}: ${e.message.split('\n').slice(0, 6).join(' ')}`); break; }
    }
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('long error messages wrap inside the pop-up message', async ({ page }) => {
  // Smart Log with a garbled AI reply shows a real error toast.
  await fakeSpeech(page);
  await page.goto('/#/');
  await expect(page.locator('.ai-fab')).toBeVisible({ timeout: 20_000 });
  // The server's error text ends up in the toast; make it long, like iOS's
  // "A server with the specified hostname could not be found."
  await page.route('**/api/ai/chat', r => r.fulfill({ status: 503, json: {
    error: 'A server with the specified hostname could not be found, so the request never reached the AI.' } }));
  await page.evaluate(() => { window.__speech = 'two eggs and toast'; });
  await holdTrace(page, 1000);
  const toast = page.locator('.toast').first();
  await expect(toast).toBeVisible({ timeout: 15_000 });
  const box = await toast.boundingBox();
  const vw = page.viewportSize().width;
  expect(box.x, 'toast starts off screen').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'toast runs off screen').toBeLessThanOrEqual(vw);
  await expectTextFits(page, 'error toast');
});
