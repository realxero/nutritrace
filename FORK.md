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

## Web vs iOS app

| Feature | Web | iOS app | Why different |
|---|---|---|---|
| Apple Health | via iOS Shortcut / Health Auto Export pushing to the server | read directly on the phone | Browsers can't read HealthKit |
| Reminders | browser notifications (while the page is open) or a push service (ntfy/Gotify) | scheduled on the phone | Browsers can't schedule notifications when closed |
| Smart reminders (skip if already logged) | — | — | Android-only upstream (WorkManager); iOS gets fixed-time reminders |
| Voice | Safari speech (can be patchy in home-screen apps) | Apple speech recognition | — |
| Everything else | same | same | — |

## Building

- **Web/server:** `docker build -t nutritrace-ah:latest .` on the server.
- **iOS:** push to GitHub → Actions → *NutriTrace iOS IPA* → Releases → *nutritrace-ios*.
- **Tests:** `npm test` (unit) and `cd e2e && npx playwright test` (see `e2e/README.md`).

Bump `FORK_VERSION` in `src/lib/version.js` and add a row above with each patch.
