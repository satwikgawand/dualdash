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

Completed in M2 (2026-10-26):

- **Session stats** (M2-O1): manual start/stop with a stop summary card, silent auto-pause after 90 s stationary, auto-resume on movement — RAM-only.
- **Nag-safe start suggestion** (M2-O2): at most one prompt per drive; ✕ silences for the process lifetime; 10-minute re-arm cooldown.
- **Over-speed threshold alert** (M2-O3): ± 5/± 10 stepper, haptic + screen-edge flash, 15 s re-fire cap, 1 km/h hysteresis. `@capacitor/haptics` v8.0.2 is the only new dependency.
- **Rotating compass** (M2-O4): unit-vector smoothed heading ring (Drive), small arrow (HUD), suppressed below 3 m/s.
- Tests: **209 / 209** across 13 files (session machine incl. nag guard, threshold hysteresis + cadence, heading seam + suppression, formatting).

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

| M1-O7 | **2026-10-25 — location chain: permission → provider → watch → chip (never a silent failure).** **(a) Five chip states in the existing fix-age area** replace the single generic "NO FIX": `LOCATION NEEDED` (+[Allow]), `LOCATION DENIED` (+[Retry], plus Settings navigation — no maintained Capacitor settings deep-link exists, so instructions are the honest fallback), `LOCATION OFF` (location services disabled, quick-settings hint, +[Re-check]), `SEARCHING` (chain healthy, watching, no fix yet) and `SIGNAL LOST — last fix <age>` (the existing STALE/LOST age chip). Precedence: denied → services off → not yet granted → fix age. The never-fake-0.0 rule is unchanged. **(b) Chain owned by `CapacitorSpeedSource`:** explicit `requestPermissions()` on first launch; a 2 s reconcile loop re-reads permission + provider (`checkPermissions()` — the plugin rejects it with OS-PLUG-GLOC-0007 when services are off, which is how provider state is read without new dependencies) and (re)starts the watch as soon as both allow it, so a grant that lands after mount is not lost. A coarse-only grant (Android 12+ "Approximate") counts as `granted` with `precise=false` — it is NOT a denial — and `enableHighAccuracy` is passed only when FINE is granted so watch start cannot raise a second surprise dialog. **(c) Watch config is explicit:** `timeout: 15000`, `interval: 1000`, `minimumUpdateInterval: 1000`. The plugin arms a first-emission watchdog at `timeout` (default 10000; we shipped 1000) and otherwise defaults `interval` to `timeout` with a 5000 ms minimum update interval — both outside the 3 s LIVE window (`PIPELINE.LIVE_MAX_AGE_MS`). **(d) Nothing is swallowed:** every native error is recorded (code + message) in diagnostics and mapped to state effects by `src/platform/locationErrors.ts` (0003 → denied, 0007/0009/0017 → provider off, everything else recorded). **(e) Debug overlay gains** permission (precise/approximate), provider on/off, watch active/inactive and last error code+message; fix age was already shown. **(f) Fix timestamps** come straight from `performance.now()` — the same clock as the staleness tick — because an anchor captured after the permission dialog back-dated every fix by the grant duration and forced LOST regardless of signal. | Owner card: "never receives a GPS fix — audit the permission/watch chain, map distinct failure states, add diagnostic overlay". Root causes and evidence in CHANGELOG. |

| M1-O8 | **2026-10-25 — rolling odometer speed readout (animated digits).** **(a) Digit-by-digit render:** `SpeedReadout` (shared by Drive and HUD mode) draws each digit as a window over a vertical 0-9 strip; the strip moves with a CSS `transform` on the strip element, so the digit rolls into place instead of swapping. Pure CSS transition — no animation library (a lib would need a SPEC reason and a ≤5 kB gzip budget; CSS buys the same effect for free). **(b) Timings:** roll **320 ms** (inside the 250–400 ms card band), easing **`cubic-bezier(0.22, 1, 0.36, 1)`** (ease-out, no overshoot — no bounce), **30 ms left-to-right stagger** per column. Worst case for a 4-digit field is 410 ms, so the readout is at rest well before the next 1 Hz sample. **(c) Honest data:** the strip animates only to the latest pipeline sample; nothing is drawn between fixes. **(d) Freeze (M1-O7 unchanged):** while `confidence = frozen` (STALE/LOST) the transition is `none` — held digits never roll, and the LOCATION chips, SIGNAL LOST banner and speed-frozen note are untouched. **(e) Reduced motion:** `prefers-reduced-motion: reduce` maps every column transition to `none` (instant swap), detected live via `matchMedia` so an OS toggle applies without a reload. **(f) Stable field:** slots are left-padded to 3 digits (odometer style: 19 km/h renders `019`), `tabular-nums` keeps every column the same width, so no digit change shifts the layout; a value above 999 grows the field rather than truncating. **(g) First paint:** a column mounts already at its digit with `transition: none`, so the first fix appears without a spin-in. Pure digit logic (split / round / pad / transition mapping) lives in `src/components/speedRoll.ts`; it is display formatting, so `src/core` has an empty diff. | Owner request: "better display for the speed — use React animations where the numbers scroll instead of just changing… make the app feel polished." Verified in-browser: roll observed mid-flight, HUD mirror composes with `scaleX(-1)`, freeze-dim and reduced motion emulated. |
| M2-O1 | **2026-10-26 — session stats: manual core + silent auto-pause (RAM-only).** Manual START/STOP in Drive mode (HUD stays minimal); STOP renders a summary card (distance / elapsed / avg / max) until dismissed. Auto-pause: smoothed speed ≤ 1 m/s held 90 s → PAUSED (visible state); auto-resume at ≥ 3 m/s held 2 s. Never auto-ends, never prompts to pause. Distance = sum of fix-to-fix displacement. | Owner-approved contract. 1 m/s sits above parked GNSS drift (0–0.83 m/s); 90 s covers a long light without pausing at ordinary red lights. Constants: `src/session/constants.ts`, each with its reason. |
| M2-O2 | **2026-10-26 — start-suggestion nag guard: at most one prompt per drive.** Chip "Start session?" appears when smoothed speed > 5 km/h holds 10 s with no session; visible 15 s (auto-hide counts as ignored); ✕ or ignore → silent for the process lifetime; an ignored chip re-arms only after a 10-minute cooldown. | The owner's explicit anti-nag rule. RAM-only: the guard resets on app restart, consistent with M1-O5. Tests prove once-per-drive + cooldown. |
| M2-O3 | **2026-10-26 — over-speed threshold alert.** In-session line set via quick stepper (± 5 / ± 10 km/h off current speed, floor 5 km/h), RAM-only, shown on the readout. Crossing above → haptic + screen-edge flash (both modes); while continuously over, re-fires at most every 15 s; 1 km/h re-arm hysteresis stops buzz-dance at the boundary. Haptics via official `@capacitor/haptics` v8.0.2 — the only new M2 dependency (verified 2026-10-25: published 2026-09-28, peer `@capacitor/core` ≥ 8, repo github.com/ionic-team/capacitor-haptics; web build maps to `navigator.vibrate`). `Buzz` seam follows the SpeedSource/ScreenLock pattern; devices without a vibrator fall back to the edge flash alone. | Owner-approved. Constants + reasons in `src/session/constants.ts`. |
| M2-O4 | **2026-10-26 — rotating compass with seam-free circular smoothing.** Heading = GPS true course through `HeadingFilter`: unit-vector (sin/cos) exponential blend, TAU 1.5 s (~63 % of a turn absorbed in 1.5 s, > 95 % within ~4.5 s), atan2 out — degrees are never averaged naively across the 0/360 seam. Suppressed to `--` below 3 m/s (GPS course unreliable at low speed); suppression longer than 30 s re-seeds from the new sample (the car may have been turned while parked). Drive mode: ring rotating under a fixed index; HUD: small arrow. | Owner-approved "rotating compass thingy". Filter + gates documented with reasons in `src/session/heading.ts`. |

### Location lifecycle and failure states (M1-O7, 2026-10-25)

Lifecycle (owned by `CapacitorSpeedSource`; the UI only reads diagnostics):

1. Mount → read permission + provider (`Geolocation.checkPermissions()`; it rejects with `OS-PLUG-GLOC-0007` when location services are off).
2. First launch, permission not granted → explicit `Geolocation.requestPermissions()`.
3. Permission granted **and** provider on → `watchPosition({ enableHighAccuracy: precise, timeout: 15000, interval: 1000, minimumUpdateInterval: 1000 })`.
4. While running: re-read permission + provider every 2 s and (re)start or drop the watch to match. A grant that lands after mount, Location switched back on, or a revoked permission are all picked up without a restart.
5. Callbacks → fixes (stamped with `performance.now()`, the staleness tick's clock) or an error (code + message → diagnostics + state effects). An error before the first fix ends that watch channel, so the id is dropped and step 4 re-arms it.
6. `chipFor()` in `src/state/locationChip.ts` maps diagnostics + fix age to the chip. `src/core` is untouched.

State table (chip precedence top to bottom):

| Permission | Provider | Watch | Last error | Fix age | Chip | User action |
| --- | --- | --- | --- | --- | --- | --- |
| `denied` | any | any | `0003` (or none) | any | **LOCATION DENIED** | [Retry] + "Allow it in Android Settings > Apps > DualDash > Permissions" |
| any | `false` | dropped | `0007` / `0009` / `0017` | any | **LOCATION OFF** | [Re-check] + quick-settings hint |
| `prompt` / `unknown` | on | not started | any | any | **LOCATION NEEDED** | [Allow] (runs `requestPermissions()`) |
| `granted` | `true`/`null` | active or starting | none, or any recorded code | no fix yet (`null`) | **SEARCHING** | none — hint names the watch state and last error code |
| `granted` | `true`/`null` | any | any | 3–10 s (STALE) / >10 s (LOST) | **SIGNAL LOST — last fix \<age\>** | none |
| `granted` | `true`/`null` | any | any | ≤3 s (LIVE) | *(no chip)* | none |

Tests: `tests/locationChip.test.ts` (table above, all six outcomes) and `tests/locationErrors.test.ts` (permission-status and error-code tables).

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
