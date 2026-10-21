// Monkey test: gremlins.js taps, scrolls, types and swipes at random.
// The app must not throw, and must still be usable afterwards.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchErrors, mockOff } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const GREMLINS = path.join(here, '..', 'node_modules', 'gremlins.js', 'dist', 'gremlins.min.js');
const SEED = Number(process.env.MONKEY_SEED || 1234);

for (const route of ['/#/', '/#/foods', '/#/settings']) {
  test(`monkey on ${route} (seed ${SEED})`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await mockOff(page);
    // Keep the monkey on this page: no file pickers, downloads, or leaving.
    page.on('filechooser', fc => fc.setFiles([]).catch(() => {}));
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await page.addScriptTag({ path: GREMLINS });
    await page.evaluate(async (seed) => {
      const g = window.gremlins;
      // Don't let gremlins click links that would log out or wipe data.
      const unsafe = el => !!el.closest?.('[href^="http"], button[class*="danger"], [data-danger], .btn-danger');
      const horde = g.createHorde({
        randomizer: new g.Chance(seed),
        species: [
          g.species.clicker({ canClick: el => !unsafe(el) }),
          g.species.toucher(),
          g.species.formFiller(),
          g.species.scroller(),
          g.species.typer(),
        ],
        mogwais: [g.mogwais.alert(), g.mogwais.gizmo({ maxErrors: 1000 })],
        strategies: [g.strategies.distribution({ nb: 400, delay: 15 })],
      });
      await horde.unleash();
    }, SEED);
    expect(errors.filter(e => e.startsWith('pageerror')), 'uncaught errors during monkey run').toEqual([]);
    // still alive: navigation works
    await page.goto('/#/');
    await expect(page.locator('.meal-photo-btn').first()).toBeVisible({ timeout: 20_000 });
  });
}
