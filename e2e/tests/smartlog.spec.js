// Hold-to-talk Smart Log, with a fake microphone.
import { test, expect } from '@playwright/test';
import { watchErrors, fakeSpeech, holdTrace, mockOff, gotoDiary } from './helpers.js';

test.beforeEach(async ({ page }) => { await fakeSpeech(page); await mockOff(page); });

test('words appear while holding; Costco hot dog is an AI estimate, not buns', async ({ page }) => {
  const errors = watchErrors(page);
  await gotoDiary(page);
  await page.evaluate(() => { window.__speech = 'log a costco hot dog to breakfast'; });
  await holdTrace(page, 1200, async () => {
    const panel = page.getByTestId('voice-panel');
    await expect(panel).toContainText('costco hot dog');
  });
  await expect(page.getByText('Smart Log')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('AI est.')).toBeVisible();
  await expect(page.getByText('Costco Hot Dog').first()).toBeVisible();
  // The rolls may sit under "Swap match" as an alternative, but must not be the pick.
  await expect(page.getByText('Sliced Hot Dog Rolls').filter({ visible: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a very long sentence stays inside the voice panel', async ({ page }) => {
  await gotoDiary(page);
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  await page.evaluate(s => { window.__speech = s; }, long);
  await holdTrace(page, 2600, async () => {
    const panel = page.getByTestId('voice-panel');
    await expect(panel).toBeVisible();
    const fits = await panel.evaluate(el => {
      const r = el.getBoundingClientRect();
      const w = el.querySelector('.vp-words');
      return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && w.scrollWidth <= w.clientWidth + 1;
    });
    expect(fits).toBe(true);
  });
  await expect(page.getByText('Smart Log')).toBeVisible({ timeout: 15_000 });
});

test('25 foods in one breath all reach the review list and log', async ({ page }) => {
  await gotoDiary(page);
  const foods = Array.from({ length: 25 }, (_, i) => `food${i}`).join(', ');
  await page.evaluate(s => { window.__speech = `for snacks I had ${s}`; }, foods);
  await holdTrace(page, 2000);
  const add = page.getByRole('button', { name: /Add 25 to Diary/ });
  await expect(add).toBeVisible({ timeout: 20_000 });
  await add.click();
  await expect(page.getByText(/Logged 25 items/)).toBeVisible({ timeout: 20_000 });
});

test('a garbled AI reply shows an error instead of breaking', async ({ page }) => {
  const errors = watchErrors(page);
  await gotoDiary(page);
  await page.evaluate(() => { window.__speech = 'BADJSON eggs'; });
  await holdTrace(page, 1000);
  await expect(page.getByText(/invalid JSON|rephras|Smart Log parse failed/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ai-fab')).toBeVisible();
  expect(errors.filter(e => e.startsWith('pageerror'))).toEqual([]);
});

test('releasing with no words says so', async ({ page }) => {
  await gotoDiary(page);
  await page.evaluate(() => { window.__speech = ''; });
  await holdTrace(page, 1000);
  await expect(page.getByText(/Didn.t catch that/)).toBeVisible();
});
