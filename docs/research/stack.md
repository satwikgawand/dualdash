# Stack verdict: Capacitor vs native Kotlin for DualDash v1

**Executive summary.** v1's requirements are all satisfiable today from a Capacitor shell: a foreground ~1 Hz location stream (`@capacitor/geolocation` `watchPosition`), keep-screen-on (`@capacitor-community/keep-awake`, or the Web Screen Wake Lock API which reached Baseline in 2025), runtime permission prompts (Capacitor forwards them to the OS), HUD mirror rendering (pure CSS), and trip writes to Turso over HTTPS (plain `fetch`, no plugin at all). The house leaning — PWA UI + Capacitor shell + Turso — is therefore **GO for v1**, with one condition: build the location pipeline behind a thin interface so it can be swapped for a native plugin without touching UI code. **Go native later only if** one of four forcing conditions triggers: raw NMEA/GnssStatus streams, a background/foreground service with notifications while driving, sustained 60 fps rendering failures in HUD mode, or per-device location tuning that a WebView plugin cannot express. Each is named below with the trigger threshold that would make us switch.

## 1. v1 requirement list

| # | Requirement | Source of the requirement | Capacitor path | Native path |
| --- | --- | --- | --- | --- |
| R1 | Foreground location at ~1 Hz, high accuracy, while the app is open | `gps-speed.md` §2 | `@capacitor/geolocation` `watchPosition({enableHighAccuracy:true})` — https://capacitorjs.com/docs/apis/geolocation | `FusedLocationProviderClient` + `LocationRequest` |
| R2 | Keep screen on during a drive | HUD usability; Android warns screen-on drains battery — https://developer.android.com/develop/background-work/background-tasks/awake/screen-on | `@capacitor-community/keep-awake` (v8.0.1, Capacitor 8, MIT) — https://github.com/capacitor-community/keep-awake ; or Web Screen Wake Lock API (`navigator.wakeLock`), Baseline since 2025 — https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API | `FLAG_KEEP_SCREEN_ON` / `android:keepScreenOn` — https://developer.android.com/develop/background-work/background-tasks/awake/screen-on |
| R3 | Native-feeling runtime permissions (fine location) | Play policy + UX | Capacitor plugin declares `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` in the manifest and forwards the OS prompt — https://capacitorjs.com/docs/apis/geolocation | `ActivityResultContracts.RequestMultiplePermissions` |
| R4 | HUD mirror mode (flipped readout for windshield reflection) | `competitors.md`, product scope | CSS `transform: scaleX(-1)` on the readout container — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/transform-function/scaleX | Compose `graphicsLayer { scaleX = -1f }` — same idea, more ceremony |
| R5 | Trip logging to Turso | House stack, `SPEC.md` | Turso is an HTTPS SQL API; plain `fetch` from the WebView needs no plugin — https://turso.tech/pricing | Same `fetch`, or Turso's native SDK |
| R6 | Mobile-first 44 px touch targets | WCAG 2.5.5 recommends 44×44 CSS px — https://www.w3.org/WAI/WCAG21/Understanding/target-size.html ; Apple 44 pt — https://developer.apple.com/design/tips/ ; Material 48 dp — https://support.google.com/accessibility/android/answer/7101858 | CSS sizing; enforce with a design-token lint | Compose `Modifier.size(48.dp)` |
| R7 | Offline operation (tunnels, dead zones) | `gps-speed.md` §5 | Service worker + local-first trip store (IndexedDB), Turso sync when online | Room/SQLite local-first, sync worker |
| R8 | Battery/thermal honesty | `gps-speed.md` §7 | Stop the watch on `visibilitychange`/background; Web Wake Lock released automatically when the page goes hidden — https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API | Same lifecycle in `onStop`, plus `PowerManager` thermal listener |

**Read of the table:** every v1 row has a shipping Capacitor path, and none of them is exotic. R1 is the only row with a known caveat (see §3).

## 2. Capacitor vs native: the trade, as evidenced

**For Capacitor (v1-shaped work):**

- It is a web app in a native shell — one codebase, and the UI layer is ordinary HTML/CSS/JS. Ionic's own decision guide frames Capacitor as the route for teams that already write web: "the vast majority of developers — more than 70% — are familiar with the languages of the web (HTML, CSS, JavaScript)." — https://ionic.io/resources/articles/choosing-the-right-mobile-approach
- The official geolocation plugin covers R1's surface (`getCurrentPosition`, `watchPosition`, `clearWatch`, `checkPermissions`, `requestPermissions`) and documents the Android permissions itself — https://capacitorjs.com/docs/apis/geolocation
- Keep-awake and foreground-service plugins exist and are maintained for Capacitor 8: https://github.com/capacitor-community/keep-awake , https://capawesome.io/docs/sdks/capacitor/android-foreground-service/
- The ecosystem is active: Capacitor 8 released with "nearing one million downloads per week" — https://ionic.io/blog/announcing-capacitor-8

**Against Capacitor (the costs to plan for):**

- **Bridge latency is real.** Forum measurements of JS→Android→JS round trips report ~20 ms best case and ~100 ms in one test — https://forum.ionicframework.com/t/native-calls-have-a-lot-of-latency-android/243664 . A 1 Hz location stream does not care; a per-frame bridge call would.
- **Cold-start overhead.** Community reviews put Capacitor Android cold start at roughly 280–450 ms over native, with core plugin registration costing several milliseconds (an upstream issue: https://github.com/ionic-team/capacitor/issues/2992 ; review figures: https://androiddocs.com/capacitor-for-android-review-tested-by-daniel-park-3/ ). Irrelevant once a drive session is running; felt at app open.
- **WebView rendering is the real risk, not the bridge.** Android's own performance guidance: a frame must render in under 16 ms for 60 fps — https://developer.android.com/topic/performance/issues/render . Long lists and heavy DOM are the classic hybrid jank source (https://github.com/ionic-team/capacitor/discussions/3899 ). DualDash's HUD screen is one big number — a *small* DOM — so this risk is low for v1's main screen, higher for a future trip-history list.
- **Plugin gaps.** Some capabilities have no first-party plugin and depend on community maintenance (`keep-awake`, `android-foreground-service`). Both exist and track Capacitor 8 today; they are single-maintainer risks, not blockers.

## 3. The one caveat on R1

`@capacitor/geolocation` wraps the platform geolocation path. Known issue: on Android, `watchPosition` can ignore the `timeout` option — https://github.com/ionic-team/capacitor-plugins/issues/1465 . For a HUD the timeout is not the contract we rely on (we render whatever arrives and track staleness ourselves — `gps-speed.md` §5), so this is tolerable. **But** if the plugin cannot be configured to a `PRIORITY_HIGH_ACCURACY`-equivalent 1 Hz stream on a test device, the fallback is a **thin custom Capacitor plugin** wrapping `FusedLocationProviderClient` — a ~100-line Kotlin class registered with Capacitor, not a rewrite. That is the interface to isolate: `SpeedSource { onFix(cb) }` in the UI layer, one implementation now, swappable later.

## 4. Features that would FORCE native later

Switch to native Kotlin if any of these triggers. Each has a measurable threshold so the decision is not a matter of taste.

| # | Forcing condition | Trigger threshold | Why Capacitor stops being enough |
| --- | --- | --- | --- |
| F1 | **Raw NMEA / `GnssMeasurements` / `GnssStatus` streams** | v1.5+ wants per-satellite CN0, used-in-fix counts, or raw measurement logging beyond what `Location` exposes. `GnssMeasurementsEvent.Callback` and `GnssStatus.Callback` are platform APIs with no Capacitor equivalent — https://developer.android.com/reference/android/location/GnssMeasurementsEvent.Callback , https://developer.android.com/reference/android/location/GnssStatus.Callback | These are continuous, high-rate, permission-gated native callbacks. Bridge cost per event becomes the bottleneck; a custom plugin is possible but at that point you are maintaining a native codebase anyway. |
| F2 | **Foreground service with a persistent notification while driving** | Requirement: keep tracking + display alive when the screen is off or another app is in front, during an active drive. Android 14+ mandates a declared service type and `FOREGROUND_SERVICE_LOCATION` permission, with while-in-use restrictions — https://developer.android.com/develop/background-work/services/fgs/service-types | A Capacitor plugin exists (https://capawesome.io/docs/sdks/capacitor/android-foreground-service/) but notification interaction, service lifecycle, restart-on-kill and Play policy review are all native-shaped work. If this becomes core rather than optional, own it natively. |
| F3 | **Sustained rendering failure in HUD mirror mode** | HUD screen misses 16 ms frames repeatedly on target hardware during a drive test — https://developer.android.com/topic/performance/issues/render | The HUD is the product. If CSS transform + continuous number updates cannot hold 60 fps on low-end Android, the screen must be Compose. |
| F4 | **Per-device location tuning a WebView plugin cannot express** | Drive tests show the smoothing/gating pipeline (`gps-speed.md` §3–4) needs device-specific GNSS configuration, `GnssMeasurements`-based corrections, or fix-rate guarantees that the plugin surface cannot deliver | Same as F1 in effect: you end up writing the native layer regardless. |

**Non-forcing (explicitly checked):** none of R1–R8 is a forcing condition on its own. Keep-screen-on, permissions, mirror CSS, Turso-over-HTTP and 44 px targets all have shipping Capacitor paths (§1).

## 5. Recommended architecture (v1)

```
PWA UI (HTML/CSS/JS, mobile-first, 44px targets)
   │  SpeedSource interface (onFix, state: LIVE|STALE|LOST)
   ├── @capacitor/geolocation watchPosition   ← default impl
   ├── (future) custom Capacitor plugin / native module  ← swap-in
   │  smoothing + stationary gate (pure JS, unit-testable)
   │  trip recorder → local store (IndexedDB)  →  sync → Turso (HTTPS fetch)
   ├── @capacitor-community/keep-awake  (or Web Wake Lock API)
   └── Capacitor shell → Android package
```

Design rules that keep the exit cheap:

1. **All platform calls behind one module.** UI never imports a Capacitor plugin directly; it imports `SpeedSource`, `ScreenLock`, `TripStore`.
2. **Smoothing and gating are pure functions** over a fix stream — no platform calls inside — so they are testable off-device and portable to native unchanged.
3. **Trips are local-first.** Turso is a sync target, not the source of truth; a WebView crash must not lose a drive.
4. **Measure, don't assume.** Put a frame-time counter and a fix-interval histogram in a debug overlay from day one; F3 and F1 decisions should be made from those numbers.

## 6. Verdict

**RECOMMENDATION: Capacitor (PWA UI + Capacitor shell, trips to Turso) for DualDash v1 — GO.**

Why, in one line each:

- **Every v1 requirement has a shipping, maintained path** (§1) — no requirement in this list is blocked on native-only APIs.
- **The risky parts are isolated and cheap to replace** (§5): one `SpeedSource` interface is the whole blast radius if location needs go native.
- **Native's advantages in this domain are concentrated in features v1 does not have** (§4): raw GNSS streams, background foreground-service tracking, and hard rendering guarantees are v2+ questions with explicit trigger thresholds.
- **Cost:** one web codebase, one test surface, and Turso over plain HTTPS means no custom sync plugin. Ionic's guide notes the maintenance economics of a shared codebase — https://ionic.io/resources/articles/choosing-the-right-mobile-approach

**Conditions on the GO:**

- **C1:** Prove R1 on a real device in the first week — 1 Hz sustained, `enableHighAccuracy`, no timeout stalls (known issue: https://github.com/ionic-team/capacitor-plugins/issues/1465 ). If it fails, write the thin custom plugin (§3) rather than switching stacks.
- **C2:** Prove R2 (keep-awake) holds the screen for a 30-minute simulated drive on a mid-range device.
- **C3:** Keep the `SpeedSource` seam from day one; a stack switch later must not require rewriting the smoothing, gating or trip logic.
- **C4:** Revisit this verdict when any F1–F4 threshold is hit — that is the decision point, not a calendar date.

## 7. Open questions

- O1: Minimum Android version? It sets which location and wake-lock APIs are safe (feeds `SPEC.md` O5).
- O2: Local-first store — IndexedDB directly, or a small wrapper (e.g. a SQLite-in-WASM layer) so the schema matches Turso exactly?
- O3: Is there an iOS target at all? Capacitor's value grows with a second platform; if Android-only forever, native becomes relatively more attractive.
- O4: Who owns the drive-test instrumentation (frame time, fix interval) — it gates C1–C2 and F1–F3.
