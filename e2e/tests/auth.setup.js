// Creates the test account and turns on the features the tests exercise.
import { test as setup, expect } from '@playwright/test';

setup('create account + settings', async ({ request }) => {
  const reg = await request.post('/api/auth/register', {
    data: { username: 'tester', password: 'Correct-Horse-Battery-9' },
  });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  const me = await (await request.get('/api/auth/me')).json();
  const headers = { 'X-CSRF-Token': me.csrf };
  const settings = {
    aiEnabled: true, quickLogEnabled: true, wellnessEnabled: true, appleHealthEnabled: true,
    diaryShowCompletion: true, showQuickCalories: true, setupComplete: true,
  };
  const r = await request.put('/api/settings/bulk', { headers, data: { settings } });
  expect(r.ok(), await r.text()).toBeTruthy();
  await request.storageState({ path: '.auth/state.json' });
});
