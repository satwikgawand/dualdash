# Changelog

All notable changes to DualDash are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — M2 polish: direction-aware roll, heading tape, production visual pass (2026-10-26)

The readout, the compass and the whole Drive/HUD surface in one visual language. Realtime-only scope (M1-O5) unchanged: nothing is stored, nothing added to `src/core`, zero new dependencies.

- **Direction-aware odometer** (M2-O5). Digit strips now roll with the speed change: accelerating, the ones column climbs through the 9 → 0 seam (59 → 60 rolls **up** one cell); decelerating, it descends (61 → 60 rolls **down**). Fixes the owner-reported spin-backwards artifact. The strip is drawn 31 cells (three copies of 0-9 plus the closing 0) and recentred at rest with an invisible ±10-cell jump. First paint, an unchanged speed and a km/h ↔ mph toggle stay motion-free; freeze (STALE/LOST), reduced motion and the 3-slot tabular field are unchanged.
- **Heading tape** (M2-O6). The Drive-mode compass ring is replaced by a full-width scrolling tape: ticks every 10°, the full 8-point rose labelled every 45°, a fixed centre index in the signal accent, edge fade, "N 354°" readout, ~±45° of horizon at 320–412 px. Seamless by duplication (the rose is drawn three times; the track is translated), ~250 ms follow. Below 3 m/s it dims to "— heading —"; HUD keeps its small arrow. `CompassRing.tsx` removed.
- **Production visual pass** (M2-O7). Design tokens (`--dd-*`: bg, surface, border, three text levels and ONE signal accent #ff9d2e for over-limit, edge flash, live-session dot and location problems), typographic hierarchy (dominant readout → stats → uppercase letter-spaced micro-labels), 4 px spacing scale, designed controls (44 px `dd-btn` family: solid primary for START/RESUME, accent STOP, quiet steppers; pill chips; summary card with ✕ + Done; calm suggestion invite) and micro-motion (240 ms rise-in, pulsing live dot, thinner 2 px / faster 700 ms edge flash), all disabled under `prefers-reduced-motion`.
- **Hidden diagnostics.** The drive-test overlay no longer ships on screen: five taps on the status/chip row (within 3 s) toggle it. RAM-only, so it hides again on reload. Every M1-O4/M1-O7 field is still there.
- **Tests.** 209 → **241 / 241** (15 files): roll direction incl. the 59→60 / 61→60 wraps, both-sign jumps and the unit toggle; strip recentre invariants over a 200-step drive; heading-tape wrap, scale and labels; the 5-tap gate window.
- **Browser matrix re-verified** at 320/360/375/412 px: no horizontal scroll, every control ≥ 44 px, overlay hidden by default, tape full-bleed, reduced-motion honoured.

### Added — Milestone 2 (2026-10-26)

Session stats, an over-speed alert and a rotating compass — all RAM-only; the realtime-only scope (M1-O5) holds.

- **Session stats** (M2-O1). Manual START/STOP in Drive mode; STOP shows a summary card (distance / elapsed / avg / max) until dismissed. Silent auto-pause after 90 s at ≤ 1 m/s, auto-resume at ≥ 3 m/s held 2 s. Never auto-ends, never prompts to pause.
- **Start suggestion, nag-safe** (M2-O2). "Start session?" chip after > 5 km/h held 10 s with no session; visible 15 s; ✕ or ignore silences it for the whole drive; 10-minute re-arm cooldown. At most one prompt per drive — proven by tests.
- **Over-speed threshold alert** (M2-O3). Quick stepper (± 5 / ± 10 km/h, floor 5); crossing above fires a haptic (`@capacitor/haptics` v8.0.2 — the only new dependency, Capacitor-8 verified) plus a screen-edge flash; re-fires at most every 15 s; 1 km/h hysteresis. No-vibrator devices keep the flash.
- **Rotating compass** (M2-O4). GPS course smoothed through a unit-vector filter (TAU 1.5 s, seam-free by construction); ring under a fixed index in Drive mode, small arrow in HUD; suppressed to `--` below 3 m/s, re-seeds after 30 s of suppression.
- **Tests.** 102 → **209 / 209** (13 files): session state machine, nag guard, threshold hysteresis + cadence, heading filter incl. the 0/360 seam, session formatting.

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

### Fixed — GPS fix chain: permission, watch and failure states (2026-10-25)

Owner card t_e9925eb6: on a real phone DualDash never received a fix and showed only the generic "signal lost" chip, although the permission was granted, Location quick settings were ON and the car had sky view. The audit found six independent breaks — each one alone reproduces the symptom.

**Root causes (with evidence):**

1. **Fixes were back-dated by the permission dialog.** `capacitorSpeedSource.ts` set `anchorPerfMs = performance.now()` *after* `requestPermissions()` resolved, while `useSpeed`'s staleness tick uses raw `performance.now()` from mount. `SpeedProcessor.getSnapshot(nowNs)` therefore saw `fixAgeMs ≈ time spent reading and granting the dialog` — past the 10 s `STALE_MAX_AGE_MS` that is a permanent `LOST` (and permanent NO FIX) even with perfect fixes. **Fix:** fixes are stamped with `performance.now()` directly, the same monotonic clock the tick uses.
2. **`timeout: 1000` killed the watch before the first fix.** The plugin arms a first-emission watchdog at `timeout` (`IONGLOCController.addWatch` → `emitOrTimeoutBeforeFirstEmission` → `IONGLOCLocationRetrievalTimeoutException`) and reports `OS-PLUG-GLOC-0010` ("Try with a higher timeout"). Since no fix had arrived yet, `keepAlive` was still false, so Capacitor's `MessageHandler.sendResponseMessage` sent `save=false` → `call.release(bridge)` and the JS bridge ran `callbacks.delete(...)` — that watch could never deliver another position. A cold GNSS start outdoors takes 2–30 s, well past 1 s. **Fix:** `timeout: 15000` (plugin default is 10000).
3. **Every watch error was discarded** by `if (err || !pos) return;` — no state, no chip, no overlay, so `0003/0007/0010/0017` all looked identical to the driver. **Fix:** errors are recorded (code + message) in diagnostics and mapped to state effects.
4. **Permission was all-or-nothing on the precise alias** (`perm.location !== 'granted'`). On Android 12+ an "Approximate"-only grant answers `{ location: 'denied', coarseLocation: 'granted' }`, so `start()` threw, no watch was ever created, and `useSpeed` only stored the message in `error`, which no UI element reads. **Fix:** coarse-only counts as granted with `precise=false`; `enableHighAccuracy` is passed only when FINE is granted, so watch start can no longer raise a second, surprise permission dialog.
5. **Nothing re-armed the chain.** `useSpeed` calls `source.start()` once; a rejected start was terminal, so the watch never started after a grant, a settings change or an error (the card's suspect 1 — confirmed as a structural gap). **Fix:** a 2 s reconcile loop in `CapacitorSpeedSource` re-reads permission + provider (`Geolocation.checkPermissions()`, which rejects with `OS-PLUG-GLOC-0007` when services are off — that is how provider state is read, with no new dependency) and starts or drops the watch to match.
6. **Cadence sat outside the LIVE window, and provider state was never read.** The plugin defaults `interval` to `timeout` and `minimumUpdateInterval` to 5000 ms, so a healthy watch delivered at most one fix per 5 s against a 3 s LIVE window; and its services check only guards `checkPermissions`/`requestPermissions`, not `watchPosition`, so Location-off surfaced as a generic unavailable. **Fix:** explicit `interval: 1000`, `minimumUpdateInterval: 1000`, and the reconcile loop reads provider state before arming the watch.

**Changed:**

- **Four honest chips (SPEC M1-O7) in the existing fix-age area** — `LOCATION NEEDED` (+[Allow]), `LOCATION DENIED` (+[Retry] with Android Settings instructions; no maintained Capacitor settings deep-link exists, so instructions are the fallback), `LOCATION OFF` (quick-settings hint, +[Re-check]), `SEARCHING` (watching, no fix yet) and `SIGNAL LOST — last fix <age>` (the existing STALE/LOST age chip). Precedence: denied → services off → not yet granted → fix age. The never-fake-0.0 rule and `src/core` are untouched.
- **Diagnostic overlay (SPEC O4 + M1-O7)** now shows permission (precise/approximate), provider on/off, watch active/inactive, last error code + message, and fix age — the next device run self-diagnoses.
- **Seam:** `SpeedSource` gained `diagnostics()`, `onDiagnostics()` and `requestPermission()`; `MockSpeedSource` implements them for browser dev.

**Verified:** `npm test` 87/87 ✓ (35 → 87: `tests/locationChip.test.ts` 31, `tests/locationErrors.test.ts` 21), `npm run build` ✓, `npx cap sync` ✓ (2 plugins), `./gradlew assembleDebug` BUILD SUCCESSFUL ✓ with the new bundle (`index-CPGTX1kE.js` inside the APK), `git diff origin/master -- src/core` empty ✓. Dev-browser simulation drove the live UI through `LOCATION NEEDED`, `LOCATION DENIED`, `LOCATION OFF`, `SEARCHING` and `SIGNAL LOST — last fix 2 m` (readout frozen at the last good value, never 0.0), with the overlay reporting permission/provider/watch/last error for each.

### Added — Rolling odometer speed readout (2026-10-25)

Owner card t_9b40b57d: "better display for the speed — use React animations where the numbers scroll instead of just changing… make the app feel polished." The readout changed digits instantly; a glanceable HUD deserves a settled, mechanical motion the eye can trust.

**Changed (SPEC M1-O8):**

- **Rolling digits in the one shared readout.** `SpeedReadout` (used by Drive mode and HUD mode alike) now renders the speed digit-by-digit: each digit is a window over a vertical 0–9 strip and the strip slides with a CSS `transform`, so a digit rolls into place instead of swapping. Pure CSS transition — **no animation dependency** (a library would need a SPEC justification and a ≤5 kB gzip budget; CSS does the same job for free).
- **Timings:** 320 ms roll (card band: 250–400 ms), `cubic-bezier(0.22, 1, 0.36, 1)` ease-out with no overshoot, 30 ms left-to-right stagger per column. Worst case (4 columns) settles in 410 ms — well inside the 1 s sample interval, so the readout is always at rest before the next fix.
- **Honest data.** The strip animates only to the latest pipeline sample; nothing is drawn between fixes.
- **State safety.** `confidence = frozen` (STALE/LOST) maps every transition to `none`: held digits freeze with no roll, and the M1-O7 chips, SIGNAL LOST banner and "Held last known speed" note are unchanged. `prefers-reduced-motion: reduce` maps to instant swaps, live via `matchMedia` (OS toggle applies without a reload). The first render mounts each column already at its digit with no transition, so the first fix appears without a spin-in. The km/h ↔ mph toggle re-renders the field and rolls cleanly.
- **Stable field.** Slots are left-padded to three digits (odometer style — 19 km/h renders `019`) with `tabular-nums`, so no digit change shifts the layout; values above 999 grow the field rather than truncate. HUD's `scaleX(-1)` mirror composes with the strip transform unchanged.
- **Code:** new `src/components/speedRoll.ts` (pure digit split / round / pad / transition mapping — display formatting, so `src/core` stays untouched) and the `RollingDigit` / `RollingSpeed` components in `src/components/readout.tsx`.

**Verified:** `npm test` 102/102 ✓ (87 → 102: new `tests/speedRoll.test.ts` 15 — rounding, splitting, leading zeros, digit-boundary crossings, field growth, reduced-motion/freeze transition mapping, settle-before-next-sample budget), `npm run build` ✓, `npx cap sync` ✓, `git diff origin/master -- src/core` empty ✓. Dev-browser evidence: strips observed mid-roll (partial offsets between old and new digits) across consecutive 1 Hz samples; HUD mirror rendered the roll flipped as one unit; reduced-motion emulation (`Emulation.setEmulatedMedia`) switched all three strips to `transition: none`; SIGNAL LOST froze the value at 007 across four samples with `transition: none` and the banner + frozen note present; km/h → mph re-rendered 7 → 4 mph; no horizontal scroll at 320/360/375/412 px with digits fully visible.

### Build — Final Milestone 1 debug APK (2026-10-25)

Owner card t_dff69d61: rebuild the debug APK on the M1 master after the system-UI pass and hand the file back.

- **Artifact.** `android/app/build/outputs/apk/debug/app-debug.apk` — 11,757,441 bytes, sha256 `ff63142a823205e48c4b57253f7693c9ffd2c08772a956dbd41dee6760fe2e49`, package `com.satwik.dualdash` (aapt: versionName 1.0, minSdk 29, targetSdk 36). Built 2026-10-25 on master `0dffd7b` ("DualDash M1-O8: rolling odometer speed readout").
- **Features carried.** All three M1-O features of this master are inside the APK: **M1-O6 system-UI pass** (immersive native hook + `SystemBars` config + portrait lock), **M1-O7 GPS fix chain** (permission/watch lifecycle, honest failure chips), **M1-O8 rolling odometer readout** (digit strips, freeze/reduced-motion safe).
- **Bundle match.** The APK embeds `assets/public/assets/index-CTTfdFWD.js` (sha256 `088278f72e3deeba094b313b776fefc65a69f5d154bd7966644d296ab195b089`), byte-identical to the fresh `dist/assets/index-CTTfdFWD.js` from this build — the APK carries the current code, not a stale bundle.
- **Feature proofs (verified inside the APK).** (1) `assets/capacitor.config.json` in the APK contains `SystemBars: { hidden: true, style: 'DARK', insetsHandling: 'css', initialViewportFitValueHint: 'cover' }`. (2) The native immersive hook is compiled in: `MainActivity` (package `com.satwik.dualdash`) is present in `classes8.dex` with the `enterImmersive` / `setSystemBarsBehavior` / `setDecorFitsSystemWindows` strings. (3) `assets/capacitor.plugins.json` still lists exactly the 2 expected plugins — `@capacitor-community/keep-awake@6.0.0` and `@capacitor/geolocation@8.2.4` — no new dependency for the system-UI work.
- **Pipeline exit codes.** `git pull` 0 (already at `0dffd7b`), `npm ci` 0, `npm run build` 0, `npm run cap:sync` 0, `./gradlew assembleDebug` 0 (BUILD SUCCESSFUL in 28 s).

### Build — Milestone 2 debug APK (2026-10-26)

Card t_5c2832a9: build the M2 debug APK from master and hand the file back.

- **Artifact.** `/root/dualdash/android/app/build/outputs/apk/debug/app-debug.apk` — 11,757,609 bytes, sha256 `e520693eb0ba9cd933260d727e5586e52c62a9a242d19e36883b7733bfb5a571`, package `com.satwik.dualdash` (aapt: versionName 1.0, minSdk 29, targetSdk 36). Built 2026-10-26 on master `974f4bb` ("DualDash M2: session stats (nag-safe), over-speed alert, rotating compass — SPEC M2-O1..O4").
- **Features carried.** All four M2 objectives of this master: **M2-O1 session stats** (START/STOP, summary, auto-pause/resume), **M2-O2 nag-safe start suggestion** (10 s speed gate, 15 s chip, 10 min cooldown), **M2-O3 over-speed threshold alert** (stepper, hysteresis, cadence, haptic + edge flash), **M2-O4 rotating compass** (unit-vector heading filter, ring + HUD arrow).
- **Bundle match.** The APK embeds `assets/public/assets/index-BPzzFSHE.js` (sha256 `b08dfd39c1494d84ef4a0ca4913c8cecf1ea3c8f1312791d4a2bd3b7cc7a1c2e`), byte-identical to the fresh `dist/assets/index-BPzzFSHE.js` from this build.
- **Feature proofs (verified inside the APK).** (1) `assets/capacitor.plugins.json` lists exactly three plugins — `@capacitor-community/keep-awake` (`com.getcapacitor.community.keepawake.KeepAwakePlugin`), `@capacitor/geolocation` (`com.capacitorjs.plugins.geolocation.GeolocationPlugin`), `@capacitor/haptics` (`com.capacitorjs.plugins.haptics.HapticsPlugin`); `cap sync` logged the same three, haptics at 8.0.2. (2) `assets/capacitor.config.json` keeps the `SystemBars` config (`hidden: true`, `style: "DARK"`, `insetsHandling: "css"`, `initialViewportFitValueHint: "cover"`). (3) M2 string literals in the embedded `index-BPzzFSHE.js`: `session-start`, `session-stop`, `session-summary`, `session-live`, `session-paused-badge`, `suggest-start`, `suggest-dismiss`, `threshold-bar`, `threshold-step-n10`, `threshold-step-p5`, `compass-ring`, `compass-label`, plus `stationary` (18 hits). (4) Native haptics compiled in: binary grep of `classes*.dex` finds `com/capacitorjs/plugins/haptics` (8 hits in `classes3.dex`, 10 in `classes5.dex`, 2 in `classes7.dex`) and `HapticsPlugin` (3 hits in `classes3.dex`).
- **Pipeline exit codes.** `git pull` 0 (already at `974f4bb`), `npm ci` 0, `npm run build` 0, `npm run cap:sync` 0, `./gradlew assembleDebug` 0 (BUILD SUCCESSFUL in 1m 7s).
