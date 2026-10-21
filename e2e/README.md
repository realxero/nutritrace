# Fork tests

**Unit tests** (`npm test` at the repo root) cover the calorie math
(`scripts/ai-portion.test.js`), Smart Log matching (`scripts/food-match.test.js`)
and photo-estimate checks (`scripts/photo-log.test.js`).

**End-to-end tests** (this folder) boot the real server on a throwaway
database with a **mock AI** (`mock-ai.mjs`), so runs are repeatable and use no
Gemini quota, and drive the app on an iPhone-sized screen:

- `layout.spec.js` – every tab loads with no errors or sideways scrolling; camera
  buttons placed right; the day-complete bar never covers the date bar; Wellness
  with Apple Health only
- `photo.spec.js` – photo → review → label photo → edit → log (170 kcal); amount
  rescaling; Foods-tab camera; editing macros in the diary edit sheet
- `smartlog.spec.js` – fake microphone: live words, "Costco hot dog" → AI estimate
  (not buns), a 60-word sentence stays inside the panel, 25 foods at once, garbled
  AI reply, silence
- `monkey.spec.js` – gremlins.js does 400 random taps/scrolls/typing per screen;
  any uncaught error fails the test. Seed with `MONKEY_SEED=…`

Run locally: `npm run build` (root) → `cd server && npm ci` → `cd e2e && npm install
&& npx playwright install webkit && npx playwright test`.
On GitHub they run automatically on every push (Actions → "Fork tests").
