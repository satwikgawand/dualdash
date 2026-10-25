# Changelog

All notable changes to DualDash are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — Milestone 1 (2026-10-25)

First drive-testable build: a standalone GPS speed HUD with two display modes and the research-bound speed pipeline. Realtime-only: it stores nothing (see the scope change below).

- **Scaffold.** Vite + React + TypeScript + Tailwind (house stack), PWA manifest + icon, Capacitor 8 Android shell, app id `com.satwik.dualdash`. `npx cap sync` exits clean. Location permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`) declared in the app manifest; `minSdkVersion` set to 29 (Android 10).
- **GPS speed pipeline** (`src/core/`), implemented exactly per `docs/research/gps-speed.md`:
  - `SpeedSource` interface seam (stack.md condition C3) with a Capacitor `watchPosition` device implementation and a mock for browser/tests.
  - Primary speed from `Location.getSpeed()` gated by `hasSpeed()`; distance/time fallback (marked lower-confidence) only when `hasSpeed()` is false and two accurate fixes allow it.
  - 1 Hz `PRIORITY_HIGH_ACCURACY` fused stream.
  - Documented pipeline order: reject bad samples → stationary gate → rolling median (window 5) → 8 m/s² acceleration clamp → display.
  - Stationary gate with hysteresis (parked car reads a hard 0.0; two consecutive moving samples required to resume).
  - Fix-age state machine LIVE (≤3 s) / STALE (3–10 s) / LOST (>10 s) on a monotonic clock.
  - **Never renders 0.0 for missing data** — freezes the last good speed and shows a NO FIX chip/banner.
- **Two screens, one data layer.** Drive mode (glanceable dashboard, huge primary speed) and HUD mode (mirrored night rendering via CSS `scaleX(-1)`, black background, one dominant readout). km/h ↔ mph toggle and Drive/HUD toggle, both ≥44 px, no horizontal scroll at 320/360/375/412 px.
- **Keep-awake** via `@capacitor-community/keep-awake` (Capacitor) with a Screen Wake Lock API fallback on web, held while the app shows realtime data.
- **Trip storage (added, then removed — see "Changed" below).** `TripStore` interface + IndexedDB implementation with a trip recorder and start/stop panel (SPEC O2/M1-O2). Removed 2026-10-25 by owner scope change M1-O5; the shipped scope has no persistence.
- **Instrumentation.** HUD debug overlay (SPEC O4/M1-O4) showing raw vs smoothed speed, fix state/age, fix count and fix interval for the drive test.
- **Tests.** Vitest unit suite covering the rolling median window, acceleration clamp, stationary hysteresis, fix-age transitions, km/h–mph conversion, and synthetic traces (jitter-at-rest, tunnel gap, `hasSpeed()` gate).
- **Docs.** SPEC updated with the M1 decision log (Android 10+, Android-only, debug-overlay instrumentation, realtime-only scope) and resolved open questions.

### Changed — Realtime-only scope, owner decision M1-O5 (2026-10-25)

The owner removed all persistence. DualDash now requests location permission, shows live speed, and stores nothing. No IndexedDB, no localStorage, no server sync; view-model state lives in component memory and resets on reload.

- **Removed.** `src/platform/TripStore.ts`, `src/platform/indexedDbTripStore.ts`, `src/core/tripRecorder.ts`, `src/components/TripPanel.tsx`, trip start/stop controls and trip counters (distance, elapsed, avg, max) in Drive mode, the HUD trip REC indicator, and `tests/tripRecorder.test.ts`.
- **Kept.** Full GPS pipeline (`src/core`), `SpeedSource` seam + geolocation plugin, `ScreenLock`/keep-awake, Drive and HUD modes, mode toggle, fix-age chip, debug overlay.
- **Docs.** SPEC records M1-O5, marks M1-O2 superseded, and drops the Turso-sync milestone from Next steps.
- **Tests.** 40 → 35 (one trip-recorder file removed; all remaining suites pass).

### Added — Android system-UI pass: immersive bars, insets, portrait lock (2026-10-25)

System-UI policy per SPEC M1-O6. The GPS pipeline, realtime-only scope (M1-O5), permissions and keep-awake are untouched; `src/core/` has an empty diff.

- **Immersive in both modes.** Status bar and gesture/navigation bar stay hidden while DualDash is foreground, in Drive and HUD mode alike. A swipe from the screen edge reveals them transiently (`BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`) — they overlay for a moment and auto-hide, so the driver is never trapped behind a bar. Implemented by a ~30-line native hook in `MainActivity` (`setDecorFitsSystemWindows(false)` + transient-behavior flag + `hide(systemBars())`, re-applied on window focus), plus `SystemBars: { hidden: true }` in `capacitor.config.ts` for the first frame. On Android 10 (API 29) androidx maps the flag to `SYSTEM_UI_FLAG_IMMERSIVE_STICKY`, so transient reveal works back to minSdk.
- **Insets + cutout safety.** `SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' }` injects correct `--safe-area-inset-*` values (working around the Chromium < 140 safe-area bug); mode roots pad via `calc(1rem + var(--safe-area-inset-*, env(...)))`, so the readout, toggle bar and chips clear the notch/cutout and the transient gesture area while each background still paints edge-to-edge (HUD full-bleed black, Drive keeps its 16 px margins). targetSdk 36 edge-to-edge on Android 15 is handled explicitly.
- **Status bar style.** Dark with light icons wherever the bar appears (entry/splash, transient reveal): `SystemBars: { style: 'DARK' }`, black `statusBarColor`/`navigationBarColor` + `windowLightStatusBar`/`windowLightNavigationBar` in both activity themes, black `windowBackground`, dark `windowSplashScreenBackground`, and the stock white splash drawables recolored to `#0A0A0A` (blue logo kept). No white flash at night.
- **Portrait lock.** `android:screenOrientation="portrait"` on the launcher activity — dated v1 decision, open to owner override (SPEC M1-O6).
- **Plugin choice: zero new npm dependencies.** The bundled Capacitor 8 `SystemBars` API covers the official `@capacitor/status-bar` role. `@capacitor-community/navigation-bar` (suggested on the card) returns 404 on npm and GitHub as of 2026-10-25 — removed, hence unmaintained. The maintained `@capawesome/capacitor-navigation-bar` (8.x ↔ Capacitor ≥8) does not set the transient-reveal flag either (its `hide()` only calls `WindowInsetsControllerCompat.hide()`), so the tiny native hook replaces it. Sources cited in SPEC M1-O6.
- **Verified.** `npm run build` ✓, `npm test` 35/35 ✓, `npm run cap:sync` ✓ (still only 2 plugins: keep-awake, geolocation), `./gradlew assembleDebug` BUILD SUCCESSFUL ✓.

### Build — Android toolchain + debug APK (2026-10-25)

- **Toolchain.** The VPS now carries Temurin JDK 21.0.13+9 (publisher sha256 verified) at `~/tools/jdk-21` and the Android SDK at `~/Android/Sdk`: command-line tools 13114758, platform-tools 37.0.1, `platforms;android-36`, `build-tools;35.0.0` and `build-tools;36.0.0`. All SDK licenses are accepted.
- **Debug APK.** `./gradlew assembleDebug` exits 0 on master `9f1b82f` (realtime-only strip). Output: `android/app/build/outputs/apk/debug/app-debug.apk` — 11,338,007 bytes, sha256 `0a41ad96448ee9a7abc48a260600936beeee1a35307dfddd784be603f47e9a08`.
- **Bundle check.** The APK embeds `assets/public/assets/index-C3EVWk45.js`, which is the fresh Vite output hash at build time, so the APK carries the current code.
