// Photo logging: review card, label photo, editing, logging, diary edit.
import { test, expect } from '@playwright/test';
import { watchErrors, fixture, gotoDiary } from './helpers.js';

test('meal camera → review → edit carbs → log 170 kcal with photo', async ({ page }) => {
  const errors = watchErrors(page);
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('170');
  await expect(card.getByTestId('pl-amount')).toHaveValue('414');
  await expect(card).toContainText('Read from the label');
  // add a label photo → re-analyses with both
  await card.getByTestId('photo-add-label').click();
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-label.jpg'));
  await expect(card.locator('.pl-thumb')).toHaveCount(2);
  await expect(card.getByTestId('pl-kcal')).toHaveValue('170');
  await card.getByTestId('pl-carbs').fill('16');
  await card.getByTestId('pl-log').click();
  await expect(card).toContainText('Logged to');
  await expect(page.getByText('Fairlife Core Power Vanilla').first()).toBeVisible();
  await expect(page.getByText(/414ml.*170 kcal/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('changing the amount rescales the numbers', async ({ page }) => {
  await gotoDiary(page);
  await page.locator('[data-testid="photo-input"]').first().setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('170');
  await card.getByTestId('pl-amount').fill('207');
  await card.getByTestId('pl-amount').blur();
  await expect(card.getByTestId('pl-kcal')).toHaveValue('85');
  await card.getByLabel('Close').click();
  await expect(card).toHaveCount(0);
});

test('Foods tab camera saves, then logs to a chosen meal', async ({ page }) => {
  await page.goto('/#/foods');
  await page.locator('[data-testid="photo-input"]').setInputFiles(fixture('can-front.jpg'));
  const card = page.getByTestId('photo-log-card');
  await expect(card.getByTestId('pl-kcal')).toHaveValue('170');
  await card.getByRole('button', { name: 'Lunch' }).click();
  await expect(card).toContainText('Logged to Lunch');
});

test('diary edit sheet lets you correct the macros', async ({ page }) => {
  await gotoDiary(page);
  await page.getByText('Fairlife Core Power Vanilla').first().click();
  await page.getByTestId('edit-nutrition-btn').click();
  const edit = page.getByTestId('edit-nutrition');
  await edit.getByLabel('Calories').fill('180');
  await edit.getByLabel('Protein grams').fill('27');
  await page.getByRole('button', { name: /save/i }).last().click();
  await expect(page.getByText(/414ml.*180 kcal/).first()).toBeVisible();
});
