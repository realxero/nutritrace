// Layout + stability on an iPhone-sized screen.
import { test, expect } from '@playwright/test';
import { watchErrors, expectNoHorizontalOverflow, gotoDiary } from './helpers.js';

const TABS = ['/#/', '/#/foods', '/#/wellness', '/#/statistics', '/#/goals', '/#/settings'];

test('every main tab loads without errors or sideways scrolling', async ({ page }) => {
  const errors = watchErrors(page);
  for (const t of TABS) {
    await page.goto(t);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    await expectNoHorizontalOverflow(page, t);
  }
  expect(errors).toEqual([]);
});

test('meal cards show the camera button; Foods has camera next to barcode', async ({ page }) => {
  await gotoDiary(page);
  expect(await page.locator('.meal-photo-btn').count()).toBeGreaterThanOrEqual(4);
  await page.goto('/#/foods');
  const scan = page.locator('.btn-scan-inline').first();
  const cam = page.locator('.photo-inline');
  await expect(cam).toBeVisible();
  const [a, b, input] = [await scan.boundingBox(), await cam.boundingBox(), await page.locator('.foods-search-input').boundingBox()];
  expect(b.x + b.width, 'camera overlaps barcode button').toBeLessThanOrEqual(a.x + 1);
  expect(b.x, 'camera sits outside the search box').toBeGreaterThanOrEqual(input.x);
});

test('day-complete bar never covers the date bar after scrolling', async ({ page }) => {
  await gotoDiary(page);
  const bar = page.locator('.diary-day-status');
  test.skip(!(await bar.count()), 'day completion bar not shown');
  const dateBar = page.getByText('Today', { exact: true }).filter({ visible: true }).first();
  for (const y of [0, 600, 99999, 0]) {
    // (mobile WebKit has no mouse wheel; scroll the page's scroller directly)
    await page.evaluate(y => {
      const sc = document.querySelector('.page-transition') || document.scrollingElement;
      sc.scrollTo(0, y === 0 ? 0 : sc.scrollTop + y);
    }, y);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));   // Safari toolbar collapse
    await page.waitForTimeout(400);
    const b = await bar.boundingBox(), d = await dateBar.boundingBox();
    expect(b && d, 'bar and date bar both visible').toBeTruthy();
    expect(b.y, `bar top ${b.y} vs date bottom ${d.y + d.height}`).toBeGreaterThanOrEqual(d.y + d.height - 2);
  }
});

test('Wellness with only Apple Health on is not "No integrations"', async ({ page }) => {
  await page.goto('/#/wellness');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('No integrations enabled')).toHaveCount(0);
  await expect(page.getByText('Wellness', { exact: true }).first()).toBeVisible();
});
