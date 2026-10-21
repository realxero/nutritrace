// Voice questions, Ask Me When Unsure, and divisible portions (fork.10).
import { test, expect } from '@playwright/test';
import { watchErrors, fakeSpeech, holdTrace, fixture, gotoDiary } from './helpers.js';

const setScenario = (s) => fetch('http://127.0.0.1:4010/__mock/photo', { method: 'POST', body: JSON.stringify({ scenario: s }) });
test.afterEach(async () => { await setScenario('default'); });

async function stubSpeech(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, 'speechSynthesis', { value: { speak: u => window.__spoken.push(u.text), cancel() {} } });
  });
}

test('a spoken question goes to the chat and the answer is read aloud', async ({ page }) => {
  const errors = watchErrors(page);
  await fakeSpeech(page); await stubSpeech(page);
  await gotoDiary(page);
  await page.evaluate(() => { window.__speech = 'how much protein do I have left'; });
  await holdTrace(page, 1200);
  await expect(page.getByText('You have 82 grams of protein left today.').first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => window.__spoken.join(' '))).toContain('82 grams of protein');
  await expect(page.getByText('Smart Log', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('describing food still goes to Smart Log', async ({ page }) => {
  await fakeSpeech(page); await stubSpeech(page);
  await gotoDiary(page);
  await page.evaluate(() => { window.__speech = 'two eggs for breakfast'; });
  await holdTrace(page, 1200);
  await expect(page.getByRole('button', { name: /Add 1 to Diary/ })).toBeVisible({ timeout: 20_000 });
});

test('pizza: pick 2 of 8 slices → a quarter of the calories', async ({ page }) => {
  await setScenario('pizza');
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('2400');
  await card.getByTestId('pl-portions').getByRole('button', { name: '2 slices' }).click();
  await expect(card.getByTestId('pl-kcal')).toHaveValue('600');
  await expect(card.getByTestId('pl-amount')).toHaveValue('200');
  await card.getByTestId('pl-portions').getByRole('button', { name: 'Half' }).click();
  await expect(card.getByTestId('pl-kcal')).toHaveValue('1200');
  await card.getByTestId('pl-log').click();
  await expect(card).toContainText('Logged to');
});

test('Ask Me When Unsure: answering the question re-estimates', async ({ page, request }) => {
  await setScenario('salad');
  const me = await (await request.get('/api/auth/me')).json();
  await request.put('/api/settings/bulk', { headers: { 'X-CSRF-Token': me.csrf }, data: { settings: { aiAskWhenUnsure: true } } });
  await gotoDiary(page);
  await page.evaluate(() => { try { localStorage.setItem(Object.keys(localStorage).find(k => k.endsWith('aiAskWhenUnsure')) || 'x', 'true'); } catch {} });
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  const q = card.getByTestId('pl-question');
  await expect(q).toContainText('Which dressing');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('320');
  await q.getByRole('button', { name: 'Vinaigrette' }).click();
  await expect(card.getByTestId('pl-kcal')).toHaveValue('180');
  await expect(card.getByTestId('pl-question')).toHaveCount(0);
  await request.put('/api/settings/bulk', { headers: { 'X-CSRF-Token': me.csrf }, data: { settings: { aiAskWhenUnsure: false } } });
});

test('Ask Me When Unsure off: no question, best guess', async ({ page }) => {
  await setScenario('salad');
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('320');
  await expect(card.getByTestId('pl-question')).toHaveCount(0);
});
