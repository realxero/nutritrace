// fork.12: copy foods to another day/meal/time, and fix bad barcode data
// with a Nutrition Facts photo.
import { test, expect } from '@playwright/test';
import { watchErrors, fixture, gotoDiary, mockOff } from './helpers.js';

const setScenario = (s) => fetch('http://127.0.0.1:4010/__mock/photo', { method: 'POST', body: JSON.stringify({ scenario: s }) });
test.afterEach(async () => { await setScenario('default'); });

async function logShake(page) {
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('170');
  await card.getByTestId('pl-log').click();
  await expect(card).toContainText('Logged to');
  await card.getByLabel('Close').click().catch(() => {});
}

test('copy a food from its edit sheet to yesterday, another meal, a set time', async ({ page }) => {
  const errors = watchErrors(page);
  await logShake(page);
  await page.getByText('Fairlife Core Power Vanilla').first().click();
  await page.getByTestId('edit-copy-btn').click();
  await page.getByTestId('copy-day-chips').getByRole('button', { name: 'Yesterday' }).click();
  await page.getByTestId('copy-meal').selectOption({ label: 'Lunch' });
  await page.locator('.copy-date-sheet input[type="time"], .copy-date-sheet input').last().fill('08:30').catch(() => {});
  await page.locator('.copy-date-sheet').getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByText(/Copied to Lunch on/)).toBeVisible();
  await page.getByRole('button', { name: 'Previous Day' }).first().click();
  await expect(page.getByText('Fairlife Core Power Vanilla').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('select several foods and copy them to today in their own meals', async ({ page }) => {
  await logShake(page);
  // Count diary rows only (the photo card's "Logged" message also has the name).
  const rows = page.getByRole('button', { name: /Fairlife Core Power Vanilla 414ml/ });
  await expect(page.getByTestId('photo-log-card')).toHaveCount(0, { timeout: 8000 });
  const before = await rows.count();
  await page.getByText('Fairlife Core Power Vanilla').first().click({ button: 'right' });
  await page.getByRole('button', { name: 'Select Multiple' }).click();
  await page.getByTestId('copy-selected').click();
  await expect(page.getByTestId('copy-meal')).toHaveValue('-1');
  await page.locator('.copy-date-sheet').getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByText(/Copied 1 item to their meals/)).toBeVisible();
  await expect.poll(() => rows.count()).toBe(before + 1);
});

test('a product with missing nutrition can be fixed from a label photo', async ({ page }) => {
  const errors = watchErrors(page);
  await mockOff(page);
  await setScenario('label');
  await page.goto('/#/foods');
  await page.locator('.foods-search-input').fill('mango');
  await page.locator('.foods-search-input').press('Enter');
  await page.getByRole('button', { name: 'OFF', exact: true }).click();
  await page.getByText('Sparkling Mango', { exact: false }).first().click();
  await page.getByTestId('fix-with-label').first().click();
  await expect(page.getByTestId('label-prompt')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('label-prompt-scan').click();
  await (await chooser).setFiles(fixture('can-label.jpg'));
  await expect(page.getByTestId('label-prompt')).toHaveCount(0);
  const portion = await page.locator('input[inputmode="decimal"]').first().inputValue();
  expect(portion).toBe('248');
  expect(errors).toEqual([]);
});

test('a per-100 ml label is saved as a 100 ml serving', async ({ page }) => {
  await mockOff(page);
  await setScenario('label100');
  await page.goto('/#/foods');
  await page.locator('.foods-search-input').fill('mango');
  await page.locator('.foods-search-input').press('Enter');
  await page.getByRole('button', { name: 'OFF', exact: true }).click();
  await page.getByText('Sparkling Mango', { exact: false }).first().click();
  await page.getByTestId('fix-with-label').first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('label-prompt-scan').click();
  await (await chooser).setFiles(fixture('can-label.jpg'));
  await expect(page.getByTestId('label-prompt')).toHaveCount(0);
  expect(await page.locator('input[inputmode="decimal"]').first().inputValue()).toBe('100');
});
