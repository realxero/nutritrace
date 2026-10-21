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

test('a full pan of lasagna starts at one piece, not the pan', async ({ page }) => {
  await setScenario('lasagna');
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-shared')).toBeVisible();
  await expect(card.getByTestId('pl-kcal')).toHaveValue('400');           // 3600 / 9
  await expect(card.getByTestId('pl-pieces')).toHaveText('1 piece');
  await card.getByRole('button', { name: 'More' }).click();
  await expect(card.getByTestId('pl-pieces')).toHaveText('1.5 pieces');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('600');
  await card.getByTestId('pl-portions').getByRole('button', { name: 'All' }).click();
  await expect(card.getByTestId('pl-kcal')).toHaveValue('3600');
});

test('a whole turkey logs one serving, adjustable by half servings', async ({ page }) => {
  await setScenario('turkey');
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('255');           // 6120 / 24
  await expect(card.getByTestId('pl-amount')).toHaveValue('150');
  await card.getByRole('button', { name: 'More' }).click();
  await card.getByRole('button', { name: 'More' }).click();
  await expect(card.getByTestId('pl-pieces')).toHaveText('2 servings');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('510');
  await card.getByTestId('pl-log').click();
  await expect(card).toContainText('Logged to');
  await expect(page.getByText(/300g.*510 kcal/).first()).toBeVisible();
});

test('pizza (not shared) still starts at the whole pizza', async ({ page }) => {
  await setScenario('pizza');
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('2400');
  await expect(card.getByTestId('pl-shared')).toHaveCount(0);
});

test('pasting an image into the chat box attaches it', async ({ page }) => {
  const errors = watchErrors(page);
  await gotoDiary(page);
  await page.locator('.ai-fab').click();
  const box = page.locator('.ai-textarea');
  await expect(box).toBeVisible();
  await box.evaluate(async (el) => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'copied.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('img[alt="Attached"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pasting an image LINK (how iPhone pastes Safari images) attaches the image', async ({ page }) => {
  await page.route('**/api/fetch-image**', r => r.fulfill({ json: {
    mimeType: 'image/png',
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } }));
  await gotoDiary(page);
  await page.locator('.ai-fab').click();
  await page.locator('.ai-textarea').evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'https://images.example.com/tea-bottle.jpg');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('img[alt="Attached"]')).toBeVisible();
  await expect(page.locator('.ai-textarea')).toHaveValue('');
});

test('a failed AI request shows a message IN the chat, not a hidden toast', async ({ page }) => {
  await page.route('**/api/ai/chat', r => r.fulfill({ status: 500, json: { error: 'Too many tool call rounds' } }));
  await gotoDiary(page);
  await page.locator('.ai-fab').click();
  await page.locator('.ai-textarea').fill('log this in yesterdays dinner');
  await page.locator('.ai-send-btn').click();
  await expect(page.getByText(/I got stuck trying to log that|Something went wrong/).first()).toBeVisible();
});

test('fetch-image route: login required, junk and home-network links refused', async ({ request, playwright, baseURL }) => {
  // Same rule as every private route: with user accounts on, no login → 401.
  // (In single-user mode the whole app is open to its one owner.)
  const anon = await playwright.request.newContext({ baseURL });
  const privateRoute = (await anon.get('/api/settings')).status();
  const ours = (await anon.get('/api/fetch-image?url=not-a-link')).status();
  if (privateRoute === 401) expect(ours).toBe(401);       // accounts on: login required
  else expect(ours).toBe(400);                            // single-user: open, still validated
  await anon.dispose();
  expect((await request.get('/api/fetch-image?url=not-a-link')).status()).toBe(400);
  const internal = await request.get('/api/fetch-image?url=' + encodeURIComponent('http://127.0.0.1:3199/api/health'));
  expect(internal.ok()).toBe(false);
  expect((await internal.json()).error).toBeTruthy();
});
