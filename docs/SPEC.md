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
