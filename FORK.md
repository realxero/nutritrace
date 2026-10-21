# NutriTrace — personal fork

A fork of [TraceApps/nutritrace](https://github.com/TraceApps/nutritrace)
(AGPL-3.0). Everything upstream ships is unchanged unless listed here. The
running version shows as **`v1.4.0+fork.N`** in Settings → Updates, with the
build it came from (`ios-12 · a1b2c3d` from GitHub, or `local` from your own
server).

Goal: the web app and the iOS app behave the same. Anything that only works on
one is listed with the reason.

## Patches

| # | What |
|---|------|
| 1 | **Trace `log_food` calorie fix.** Logging an amount (e.g. "414 ml") saved per-100 values (41 kcal instead of 170). Now scaled like the manual Add Food path, with sanity checks (unconvertible units, 0 kcal, impossible energy density, kcal/macro mismatch). |
| 2 | **Apple Health metrics.** Wellness tab no longer needs the Garmin toggle; Apple Health counts as its own source with its own Visible Metrics chips (Max HR included, Garmin-only scores excluded, HRV labelled SDNN). |
| 3 | **HealthProbe.** Small iOS test app proving HealthKit works in a sideloaded build (LiveContainer). Kept as a diagnostic. |
| 4 | **Photo logging + voice feedback.** Camera button on each meal: photo → AI estimate → logged with the photo. Hold-to-talk Smart Log shows live words and a "Finding foods…" step. |
| 5 | **Review, editing, matching, tests.** Photo review card (add a nutrition-label photo, optional Gemini web check, edit every number, amount rescales). Camera in the Foods tab. Edit kcal/P/C/F of a diary entry. Smart Log keeps brands and adds its own estimate; component foods ("hot dog buns") no longer win. Wellness with only Apple Health; day-complete bar overscroll fix; full-width voice panel. Unit tests + Playwright e2e/monkey tests with a mock AI. |
| 6 | **iOS app.** Capacitor iOS project, built on GitHub as an unsigned IPA for LiveContainer/SideStore. Built-in Apple Health sync (no Shortcut); server route for app pushes; CORS for the iOS app. |
| 7 | **iOS fixes.** Apple Health data shown in the app's offline copy; Connected / Sync now / Disconnect; Safari label squashing; wrapping error toasts; full-bleed icon; text-fits tests. |
| 8 | **Parity + housekeeping.** Today's Wellness numbers in the app; adaptive TDEE uses Apple Health on the phone; iPhone notifications (reminders were Android-only); fork version + build stamp; personal info removed from code; CI fixes (server deps for unit tests, WebKit-safe tests). |
| 9 | **Smart iPhone reminders.** Same rules as Android: meal reminders skip meals already logged, water stops at your goal, weigh-in skips if you've weighed in, nothing more once the day is marked complete. iOS can't run a background check, so the next 3 days are re-planned whenever the app opens, comes back to the front, or the diary changes. |
| 10 | **AI upgrades.** Voice questions: hold the button and ask ("how much protein do I have left?"); questions go to the Trace chat and the answer is read aloud (Settings → AI Assistant → Read Answers Aloud), food descriptions still go to Smart Log. *Ask Me When Unsure*: photo logging asks one quick question when an unseen detail changes the calories a lot (answer or skip). Shareable items (pizza, cake, nuggets): pick slices, half or all, and the numbers scale. *Check Products Online* toggle in settings. Fixes "Ongoing speech recognition" on a quick second hold. |
| 11 | **Shared dishes.** Photo logging tells one person's food from a dish for the table (whole turkey, lasagna pan, pot of chili, whole cake). Shared dishes start at one person's usual portion instead of the whole thing, with quick picks and a half-step stepper ("1.5 servings"); one person's food still starts at all of it. |
| 12 | **Copy foods + fix barcode data.** Tap a food → *Copy to another day or meal*; or select several and copy them at once (keeping their own meals). The Copy sheet has Yesterday / Today / Tomorrow and a time (or keeps the original time). Barcode products with missing or wrong nutrition get *Fix with a label photo*; the food editor prompts to scan the Nutrition Facts label for unknown barcodes. Label reading now respects per-serving vs per-100 g/ml and runs the impossible-number checks. |
| 13 | **Trace logging guard + paste images.** Trace can no longer log a per-100 g/ml database entry without an amount (a 547 ml iced tea was saved as 100 g / 27 kcal); it must give the real amount or ask. New `expected_kcal`: when a photo or message shows calories ("150 per bottle"), logging is refused if more than 20% off. Paste images into the Trace chat (long-press → Paste, or Ctrl/Cmd+V), plus *Paste image* in the attach menu. |

## Web vs iOS app

| Feature | Web | iOS app | Why different |
|---|---|---|---|
| Apple Health | via iOS Shortcut / Health Auto Export pushing to the server | read directly on the phone | Browsers can't read HealthKit |
| Reminders | browser notifications (while the page is open) or a push service (ntfy/Gotify) | scheduled on the phone | Browsers can't schedule notifications when closed |
| Smart reminders (skip if already logged) | — | yes | iOS re-plans on open/return/diary change instead of a background check (iOS doesn't allow one); if you log only on the web and never open the app, a reminder can still fire |
| Voice | Safari speech (can be patchy in home-screen apps) | Apple speech recognition | — |
| Everything else | same | same | — |

## Building

- **Web/server:** `docker build -t nutritrace-ah:latest .` on the server.
- **iOS:** push to GitHub → Actions → *NutriTrace iOS IPA* → Releases → *nutritrace-ios*.
- **Tests:** `npm test` (unit) and `cd e2e && npx playwright test` (see `e2e/README.md`).

Bump `FORK_VERSION` in `src/lib/version.js` and add a row above with each patch.
