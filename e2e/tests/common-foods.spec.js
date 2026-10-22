// fork.16: built-in USDA common foods in search, logging and Smart Log; food icons.
import { test, expect } from '@playwright/test';
import { watchErrors, gotoDiary, fakeSpeech, holdTrace } from './helpers.js';

const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

test('typing "banana" shows the USDA banana instantly with an everyday portion', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/foods');
  await page.locator('.foods-search-input').fill('banana');
  const section = page.getByTestId('common-foods');
  await expect(section).toBeVisible();
  const row = section.getByTestId('common-food-row').first();
  await expect(row).toContainText('Banana');
  await expect(row).toContainText('1 medium · 105 kcal');
  await expect(row).toContainText('🍌');
  expect(errors).toEqual([]);
});

test('adding a common food from a meal logs "1 medium · 105 kcal" with its icon, and reuses it next time', async ({ page }) => {
  const errors = watchErrors(page);
  await gotoDiary(page);
  await page.goto(`/#/foods?pick=1&meal=0&date=${today()}`);
  await page.locator('.foods-search-input').fill('banana');
  await page.getByTestId('common-food-row').first().click();
  // "Ask for quantity" (on in this test server) shows the servings sheet first.
  const prompt = page.getByRole('dialog', { name: 'Banana' });
  if (await prompt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await prompt.getByRole('button', { name: 'Add to Diary' }).click();
  }
  await expect(page).toHaveURL(/#\/$|#\/diary/);
  const row = page.getByRole('button', { name: /Banana/ }).first();
  await expect(row).toContainText('1 medium');
  await expect(row).toContainText('105 kcal');
  await expect(row).toContainText('🍌');

  // Second time: the library now has "Banana · USDA"; the common section
  // hides it and the user's saved copy is what appears (no duplicates saved).
  await page.goto(`/#/foods?pick=1&meal=0&date=${today()}`);
  await page.locator('.foods-search-input').fill('banana');
  await expect(page.getByTestId('common-foods')).toHaveCount(0);          // only common hit was Banana
  const mine = page.getByRole('button', { name: /^Banana USDA/ });
  await expect(mine).toHaveCount(1);
  await expect(mine).not.toContainText('per 100');
  expect(errors).toEqual([]);
});

test('Smart Log: "2 eggs and a banana" matches USDA foods with the right amounts', async ({ page }) => {
  await fakeSpeech(page);
  await gotoDiary(page);
  await page.evaluate(() => { window.__speech = '2 eggs and a banana'; });
  await holdTrace(page, 1200);
  const add = page.getByRole('button', { name: /Add 2 to Diary/ });
  await expect(add).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Egg, large/).first()).toBeVisible();
  await add.click();
  await expect(page.getByText(/Logged 2 items/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Egg, large/ }).first()).toContainText('144 kcal');
});

test('foods without a photo get an emoji when the name is recognizable', async ({ page, request }) => {
  const me = await (await request.get('/api/auth/me')).json();
  await request.post('/api/foods', { headers: { 'X-CSRF-Token': me.csrf },
    data: { name: 'Meat and Pineapple Pizza', portion: 550, unit: 'g', nutrition: { calories: 1350 } } });
  await page.goto('/#/foods');
  await page.locator('.foods-search-input').fill('pineapple pizza');
  await expect(page.locator('.food-list li', { hasText: 'Meat and Pineapple Pizza' }).first()).toContainText('🍕');
});
