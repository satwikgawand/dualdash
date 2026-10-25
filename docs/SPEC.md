# DualDash — Living Spec

Source of truth for the project. Update this file whenever a decision changes.

## Purpose

DualDash is a standalone GPS car HUD for Android. The driver mounts the phone, opens DualDash, and reads live speed and heading — either in drive mode or reflected on the windshield in HUD mirror mode. GPS only; no OBD-II adapter, no car pairing, no account.

Problem it solves: factory speedometers read in km/h or mph units the driver must translate, and cheap HUD apps are either ad-heavy, subscription-locked, or require an OBD dongle. DualDash is a clean, offline, realtime-only speed HUD: it shows live data and stores nothing (M1-O5).

## Current state

Phase: **Milestone 1 — drive-testable speed HUD.** Application code exists and builds; not yet drive-tested on a device.

Completed in M1 (2026-10-25):

- Scaffold: Vite + React + TypeScript + Tailwind (house stack), PWA manifest, Capacitor 8 Android shell, app id `com.satwik.dualdash`. `npx cap sync` exits clean.
- GPS pipeline per `docs/research/gps-speed.md`: `SpeedSource` seam (stack C3) with a Capacitor device implementation; `Location.getSpeed()` gated by `hasSpeed()`; 1 Hz `PRIORITY_HIGH_ACCURACY` fused stream; stationary gate with hysteresis → rolling median (window 5) → 8 m/s² acceleration clamp (documented order); fix-age state machine LIVE/STALE/LOST; never renders 0.0 for missing data (freezes last good + NO FIX chip).
- Two screens on one data layer: Drive mode (glanceable dashboard) and HUD mode (mirrored night rendering, CSS `scaleX(-1)`, black background). km/h ↔ mph toggle; in-app mode toggle. Keep-awake wired while the app shows realtime data via `@capacitor-community/keep-awake` (Capacitor) / Screen Wake Lock API (web).
- **No persistence (2026-10-25, M1-O5).** The app stores nothing: no IndexedDB, no localStorage, no server sync. `TripStore`, the IndexedDB trip store, the trip recorder and the trip panel are removed. View-model state lives in component memory and resets on reload.
- Tests: Vitest unit tests for median window, acceleration clamp, stationary hysteresis, fix-age transitions, km/h-mph conversion, and synthetic traces (jitter-at-rest, tunnel gap, hasSpeed gate). UI matrix verified in a browser at 320/360/375/412 px.
- Instrumentation: HUD debug overlay (SPEC O4) shows raw vs smoothed speed, fix state/age, fix count and fix interval for the drive test.

## Decisions

| # | Decision | Status | Basis |
| --- | --- | --- | --- |
| D1 | Name is **DualDash**. | Locked | Product owner. |
| D2 | v1 is standalone GPS only. No OBD-II. | Locked | Product scope. |
| D3 | v1 targets Android first. | Locked | Confirmed in M1 (see M1 decision log). |
| D4 | Stack: **Capacitor (PWA UI + Capacitor shell)**; ~~trips local-first, Turso later~~ **realtime-only, no persistence (M1-O5)**. | Locked (2026-10-25) | `docs/research/stack.md` verdict is GO with conditions C1–C4; M1 implements the `SpeedSource`/`ScreenLock` seams that keep the exit cheap (C3). |

### Milestone 1 decision log (2026-10-25)

Owner-locked v1 defaults, recorded here with rationale. These close SPEC open questions O3 and O5 and stack open questions O3 and O4.

| Ref | Decision | Why |
| --- | --- | --- |
| M1-O1 | **Minimum Android version is Android 10 (API 29).** `android/variables.gradle` `minSdkVersion = 29`. | Owner-locked v1 default. API 29 covers the fused-location, `getSpeed()`/`getSpeedAccuracy()` and wake-lock surfaces the pipeline uses, and drops legacy devices that would muddy drive-test results. Closes SPEC O5. |
| ~~M1-O2~~ | ~~**M1 stores trips device-local in IndexedDB behind a `TripStore` seam.** No server calls in M1. Turso sync is a later milestone.~~ **Superseded by M1-O5 (2026-10-25): no storage of any kind.** | Owner-locked; the owner's Turso account auth is pending. Local-first is a stack.md design rule (R7): a WebView crash must not lose a drive. The seam lets Turso drop in later without touching UI or trip logic. Closes SPEC O3. Kept for history. |
| M1-O3 | **v1 is Android-only.** Capacitor keeps the door open for a second platform, but no iOS target is planned. | Owner-locked v1 default. Recorded so the stack verdict's "value grows with a second platform" caveat is consciously deferred, not ignored. |
| M1-O4 | **Drive-test instrumentation (frame time, fix interval, raw vs smoothed) lives in a HUD debug overlay** built from day one. | stack.md design rule 4 (measure, don't assume) and stack O4 (who owns instrumentation). The overlay is the evidence base for the stack forcing conditions C1–C2 and F1–F4. The acceleration-clamp bound (8 m/s²) and stationary thresholds (3 m / 5 s) remain ASSUMPTIONs to tune from this data (gps-speed.md O4). |
| M1-O5 | **2026-10-25 (owner scope change): the app is realtime-only. No saved or stored data of any kind.** Remove `TripStore`, the IndexedDB trip store, the trip recorder, the trip panel and all trip counters. Keep the GPS pipeline, Drive and HUD modes, and keep-awake. Session state lives in component memory; nothing survives a reload. No IndexedDB, no localStorage, no server sync. | Owner scope change. DualDash reads live GPS and shows it; recording trips is out of scope for v1. Supersedes M1-O2 and the trip half of D4. |
| M1-O6 | **2026-10-25 — system-UI policy (Android system-UI pass).** **(a) Immersive in both modes:** the status bar and the gesture/navigation bar are hidden while the app is foreground, in Drive and HUD mode alike. A swipe from the screen edge reveals them *transiently* — `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` — so they overlay for a moment and auto-hide; the driver is never trapped behind a bar. **(b) Insets + cutout:** edge-to-edge is handled explicitly (targetSdk 36 enforces it on Android 15); mode roots pad by the injected `--safe-area-inset-*` / `env(safe-area-inset-*)` values, so the readout, toggle bar and chips clear the notch/cutout and the transient gesture area, while each mode's background still paints to every edge (HUD stays full-bleed black; Drive keeps its 16 px margins). **(c) Status bar style:** wherever a bar appears (entry/splash, transient reveal) the background is dark (`#0A0A0A`/`#000000`) with light icons — no white flash at night. The stock white splash drawables are recolored to match. **(d) Portrait lock:** `android:screenOrientation="portrait"` on the launcher activity — a dated v1 decision, open to owner override (landscape windshield mounts are a later conversation). **Plugin choice — zero new npm dependencies:** the *official* `@capacitor/status-bar` hide/style role is covered by **Capacitor 8's bundled `SystemBars` API** (`plugins.SystemBars` config: `hidden`, `style: 'DARK'`, `insetsHandling: 'css'`, `initialViewportFitValueHint: 'cover'`) — `SystemBars` is the successor API for edge-to-edge use cases (source: <https://cdn.jsdelivr.net/npm/@capacitor/core@8.0.1/system-bars.md>; Capacitor 8 announcement: <https://ionic.io/blog/announcing-capacitor-8>). The card's suggested `@capacitor-community/navigation-bar` **no longer exists** — 404 on both npm (<https://www.npmjs.com/package/@capacitor-community/navigation-bar>) and GitHub (<https://github.com/capacitor-community/navigation-bar>) as of 2026-10-25, so it is unmaintained by removal. The maintained equivalent, `@capawesome/capacitor-navigation-bar` (8.x ↔ Capacitor ≥8, active support — <https://capawesome.io/docs/sdks/capacitor/navigation-bar/>), was verified **not** to set `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` — its `hide()` only calls `WindowInsetsControllerCompat.hide()`, same as `SystemBars.hide()`; source: <https://github.com/capawesome-team/capacitor-plugins/blob/main/packages/navigation-bar/android/src/main/java/io/capawesome/capacitorjs/plugins/navigationbar/NavigationBar.java>. Since no plugin exposes the transient-reveal flag, a **tiny custom native hook** (`MainActivity.enterImmersive()`, ~30 lines: `setDecorFitsSystemWindows(false)` + `setSystemBarsBehavior(BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE)` + `hide(systemBars())`, re-applied on window focus) is the justified replacement — fewer dependencies than either community plugin and exact behavior control. Android reference for the flag: <https://developer.android.com/reference/androidx/core/view/WindowInsetsControllerCompat#BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE()>. On Android 10 (API 29) androidx maps the flag to `SYSTEM_UI_FLAG_IMMERSIVE_STICKY`, so transient reveal works back to minSdk. | Owner request "take the Android status bar and related system UI into account". Verified against AOSP/androidx sources and the plugin sources above on 2026-10-25. Portrait lock and the hook are open to owner override at the drive test. |

Deferred, unchanged: speed-limit display (SPEC O1 — product still to decide); licence (SPEC O4 — owner to set).

## Next steps

1. **Drive test (M1 gate):** build the APK on a JDK/SDK machine, mount the phone, confirm 1 Hz sustained fixes, stationary convergence, tunnel STALE/LOST freeze, HUD mirror legibility on the windshield, and keep-awake over a 30-minute drive. Tune the acceleration-clamp and stationary thresholds from the debug overlay.
2. Decide speed-limit display (SPEC O1) using `docs/research/speed-limits.md`.
3. Set the licence (SPEC O4).

## Open questions

- O1: Does v1 ship speed-limit display at all? `docs/research/speed-limits.md` gives the feasibility answer; product still has to decide. *(open)*
- ~~O2: km/h vs mph — default from device locale, or a first-run choice?~~ **Resolved (M1):** both units shipped with an in-app toggle; default km/h. Locale-based default is a possible later refinement.
- ~~O3: Does trip logging require an account/sync, or stay device-local in v1?~~ **Resolved (M1-O2); superseded by M1-O5:** there is no trip logging. The app is realtime-only and stores nothing.
- O4: What is the licence? *(open — owner)*
- ~~O5: Minimum Android version?~~ **Resolved (M1-O1):** Android 10 (API 29).
