// Fork: end-to-end tests. Boots the real NutriTrace server against a mock AI
// (mock-ai.mjs) on a throwaway database, then drives the app on an
// iPhone-sized screen. Run: cd e2e && npm test   (after `npm run build` at the root)
import { defineConfig, devices } from '@playwright/test';

const PORT = 3199;
const DATA = '/tmp/nt-e2e';
const browserName = process.env.E2E_BROWSER || 'webkit';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,                      // one shared server + database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The app's offline service worker would fetch around page.route mocks.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/, use: { browserName } },
    {
      name: 'iphone',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.js/,
      use: { ...devices['iPhone 14'], browserName, storageState: '.auth/state.json' },
    },
  ],
  webServer: [
    { command: 'node mock-ai.mjs', port: 4010, reuseExistingServer: !process.env.CI },
    {
      command: `bash -c "rm -rf ${DATA} && mkdir -p ${DATA}/db ${DATA}/uploads && cd ../server && ln -sfn ../dist dist && node index.js"`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(PORT), DB_PATH: `${DATA}/db/nt.db`, UPLOADS_PATH: `${DATA}/uploads`,
        JWT_SECRET: 'e2e', INSECURE_COOKIES: '1',
        AI_ENABLED: 'true', AI_PROVIDER: 'oai-compat', AI_BASE_URL: 'http://127.0.0.1:4010', AI_MODEL: 'mock',
      },
    },
  ],
});
