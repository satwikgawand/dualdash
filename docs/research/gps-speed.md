# GPS speed: engineering brief for DualDash v1

**Executive summary.** Use `Location.getSpeed()` as the primary speed source: Android documents it as potentially more accurate than distance/time between fixes because it can use GNSS Doppler. Pair it with a 1 Hz `PRIORITY_HIGH_ACCURACY` fused location request, gate it with a stationary check so a parked car reads 0.0 not 1.2 km/h, and smooth with a short rolling median (3–5 samples) plus a clamp on impossible acceleration — a Kalman filter is overkill for a 1 Hz source driving one number. When the fix goes stale (tunnel, garage), freeze the last good value and show a visible "NO FIX" indicator rather than zeroing the display. Show accuracy from `Location.getAccuracy()` and satellite counts from `GnssStatus`; do not show raw satellite count as a quality proxy on its own. Screen-on driving sessions are dominated by display power, not by a 1 Hz location request — keep the request continuous but stop it when the app leaves the foreground.

## 1. Where speed comes from

### 1.1 `Location.getSpeed()` semantics

Android's own documentation:

> Returns the speed at the time of this location in meters per second. Note that the speed returned here may be more accurate than would be obtained simply by calculating distance / time for sequential positions, such as if the Doppler measurements from GNSS satellites are taken into account. This is only valid if hasSpeed() is true.

— https://developer.android.com/reference/android/location/Location#getSpeed()

Two consequences:

1. **Always check `hasSpeed()` first.** If it is false, `getSpeed()` returns 0.0 and that zero means "unknown", not "stopped". The platform source confirms the value is clamped to `>= 0.0f`. — https://cs.android.com/android/platform/superproject/+/master:frameworks/base/location/java/android/location/Location.java
2. **Prefer `getSpeed()` over your own distance/time.** Doppler-derived speed is computed per fix and does not suffer the quantisation error of dividing a ~1–5 m position delta by ~1 s. Position deltas at city speed (say 10 m/s over 1 Hz = 10 m) are usable but noisier, and get worse as update rate drops or accuracy degrades.

### 1.2 Speed accuracy (API 26+)

`getSpeedAccuracyMetersPerSecond()` returns the 68th-percentile speed uncertainty in m/s; valid only when `hasSpeedAccuracy()` is true. — https://developer.android.com/reference/android/location/Location#getSpeedAccuracyMetersPerSecond()

**Use:** do not render this number to the driver in v1. Use it internally to decide whether to trust a sample (e.g. discard samples with speed accuracy > 3 m/s while moving).

### 1.3 Distance-derived speed — when to fall back

Compute distance/time yourself only when `hasSpeed()` is false but you have two fixes with good accuracy and a monotonic time base. Rules:

- Use `getElapsedRealtimeNanos()` for deltas, never `getTime()`. Android: "the device's Unix epoch time system clock is not monotonic... Prefer getElapsedRealtimeNanos() for that purpose." — https://developer.android.com/reference/android/location/Location#getTime()
- Require `distance > max(accuracy_a, accuracy_b)` before deriving speed; otherwise the delta is inside the error circle and the result is noise.
- Mark the value as `derived` so the UI can treat it as lower confidence.

## 2. Getting ~1 Hz driving updates

### 2.1 The request

Use `FusedLocationProviderClient` with a `LocationRequest`:

| Field | Value | Reason |
| --- | --- | --- |
| `priority` | `Priority.PRIORITY_HIGH_ACCURACY` | Google's guidance for "frequent, accurate updates with very low latency... foreground" is HIGH_ACCURACY or BALANCED_POWER_ACCURACY; a speed HUD needs GNSS. — https://developer.android.com/develop/sensors-and-location/location/battery/scenarios |
| `intervalMillis` | 1000 | Google: "for real time scenarios, set the value to few seconds" — 1 s is inside that envelope. — https://developer.android.com/develop/sensors-and-location/location/battery/scenarios |
| `minUpdateIntervalMillis` | 1000 | "fastest allowed interval of location updates." — https://developers.google.com/android/reference/com/google/android/gms/location/LocationRequest |
| `minUpdateDistanceMeters` | 0 | Do not gate on distance: a stopped car must still produce fixes so we can confirm "stationary". |
| `maxUpdateDelayMillis` | 0 (default) | Batching delays the readout. Leave unbundled. |
| `maxUpdates` | unset (unbounded) | The session runs until the app stops it. |

Sources for field semantics: https://developers.google.com/android/reference/com/google/android/gms/location/LocationRequest

### 2.2 Lifecycle

- Start updates in `onStart`/foreground, stop in `onStop`/background. Google's scenario guidance frames foreground updates as "the user starts an activity, consumes location data, and then stops the activity after a short time." — https://developer.android.com/develop/sensors-and-location/location/battery/scenarios
- Request permissions at runtime: `ACCESS_FINE_LOCATION` is required (coarse alone gives ~2 km obfuscated fixes, useless for speed). — https://developers.google.com/android/reference/com/google/android/gms/location/FusedLocationProviderClient
- If v1 must survive screen-off/phone-lock during a drive, that is a **foreground service** — see `stack.md` for whether Capacitor can carry it and when it forces native.

### 2.3 Expected delivery rate

A request is a *desire*, not a guarantee. Real devices deliver 1 Hz outdoors in open sky and degrade in cities. Design the UI for **0.2–1 Hz input**, not a fixed tick: render on every callback, with staleness handling (section 5).

## 3. Smoothing

### 3.1 What is available

| Method | Character | Cost | Fit for 1 Hz HUD |
| --- | --- | --- | --- |
| Rolling median (window 3–5) | Kills single-sample spikes, adds 1–2 sample lag, no state model | Trivial | **Good — start here** |
| Exponential moving average | Smooth but lags under real acceleration; smears braking | Trivial | OK as a second stage |
| Kalman filter (constant-velocity or CV-CA) | Optimal in a noise model; needs tuning, covariance handling, init | Moderate | Overkill at 1 Hz for one scalar |
| Acceleration-aware interpolation | Predict between fixes using last known accel; fills 1 Hz gaps | Low–moderate | Useful only if fixes drop below ~0.5 Hz |

References for the landscape: rolling median for GPS drift — https://www.routematching.com/gps-data-preprocessing-cleaning-fundamentals/kalman-filtering-for-gps-noise-reduction/implementing-a-rolling-median-filter-for-gps-drift-removal/ ; Kalman for Android GPS — https://maddevs.io/blog/reduce-gps-data-error-on-android-with-kalman-filter-and-accelerometer/ ; filter library with time-constant smoothing/mean/median filters — https://github.com/KalebKE/FSensor

### 3.2 Recommended pipeline for v1

```
raw fix
  -> reject if !hasSpeed() and no valid distance fallback
  -> reject if speedAccuracy > 3 m/s while speed > 2 m/s
  -> stationary gate (section 4)
  -> rolling median, window 5
  -> acceleration clamp: |dv/dt| <= 8 m/s^2  (≈ 0.8 g, hard braking bound)
  -> display
```

**Why median-first and not Kalman:** at 1 Hz the sample rate is far below the regime where a Kalman filter's advantage (predict-update over high-rate noisy sequences) pays for its tuning burden. The HUD shows one scalar; a 5-sample median removes the classic GPS spike (a single 30 km/h outlier) with zero model assumptions and no parameters to tune per device. Adopt a Kalman filter only if measured jitter after the median still fails a drive test.

**Acceleration clamp:** 8 m/s² is a generous physical bound for road vehicles (0.8 g); real passenger braking rarely exceeds ~0.7 g. A 1 Hz jump larger than that is measurement error, not motion. Marked ASSUMPTION: the exact bound is a tuning constant, validated by drive test, not a sourced figure.

## 4. Stationary jitter

A parked car with GNSS lock commonly reports 0–3 km/h of drift; some receivers report higher spikes. Sources that treat "GPS says moving when the accelerometer says still" as a real, common failure mode: https://github.com/Ikolvi/Tracelet/issues/333 (platform speed of `-1`/unavailable is treated as standing still); lifecycle design where one MOVING/STATIONARY bit drives GPS power — https://bgeo.dev/docs/android/concepts/tracking-lifecycle/

**Gate design:**

1. Compute a displacement check over the last N fixes (e.g. 5 fixes / 5 s): if total displacement < 3 m, declare `STATIONARY`.
2. While `STATIONARY`, force displayed speed to **0.0** (not the raw value) and show a "PARKED" chip if desired.
3. Require **two** consecutive samples above a re-start threshold (e.g. > 2 m/s and displacement > 5 m) before leaving `STATIONARY`. This hysteresis prevents flicker at a red light.
4. Optionally cross-check with the accelerometer: `TYPE_ACCELEROMETER` variance near zero for the same window corroborates "parked". Android motion sensors reference: https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion

The accelerometer cross-check is a v2 nicety. The displacement + hysteresis gate is sufficient for v1 and needs no extra permission.

## 5. Tunnel / no-fix behaviour

**Rule: never show 0.0 for a missing fix.** Zero is a legitimate reading (parked) and must stay unambiguous.

State machine:

| State | Trigger | Display |
| --- | --- | --- |
| `LIVE` | fix age ≤ 3 s | Normal speed, green/normal styling |
| `STALE` | fix age 3–10 s | Last good speed, amber styling, "NO FIX" chip |
| `LOST` | fix age > 10 s | Last good speed greyed or blanked, persistent "NO FIX" banner |

- Track fix age with `getElapsedRealtimeNanos()` (monotonic), not wall clock. — https://developer.android.com/reference/android/location/Location#getTime()
- **Do not dead-reckon** in v1. Tunnels are exactly where dead-reckoning error accumulates; the honest UI is "we do not know". Dead-reckoning literature confirms tunnel GNSS denial is a hard problem requiring inertial fusion: https://link.springer.com/content/pdf/10.1007/s40747-024-01744-1.pdf
- Optionally keep the *distance* accumulator running on last-known-position only inside a tunnel, but label trip distance as approximate in this state.

## 6. Satellite count and accuracy display

### 6.1 APIs

- **Accuracy:** `Location.getAccuracy()` — "estimated horizontal accuracy radius in meters... 68% percentile confidence level." — https://developer.android.com/reference/android/location/Location#getAccuracy()
- **Satellite status:** `GnssStatus.Callback.onSatelliteStatusChanged(GnssStatus)` (API 24+), registered via `LocationManager.registerGnssStatusCallback` / `LocationManagerCompat.registerGnssStatusCallback`. — https://developer.android.com/reference/android/location/GnssStatus.Callback , https://developer.android.com/reference/androidx/core/location/LocationManagerCompat
- `GnssStatus.getSatelliteCount()` returns the total satellites in the list; `GnssStatus.usedInFix(satelliteIndex)` reports whether a satellite "was used in the calculation of the most recent position fix". Per-satellite CN0 is available via `getCn0DbHz()`. — https://developer.android.com/reference/android/location/GnssStatus

### 6.2 What to show

- **Primary quality signal: accuracy radius in metres.** It is directly tied to the fix the driver is reading and needs no interpretation. Render as a badge: `±4 m`.
- **Secondary: satellites used in fix.** Compute `count = sum(usedInFix(i))`. Label it "SAT 12" — never raw `getSatelliteCount()`, which counts satellites *visible/tracked*, not *used*, and will overstate quality.
- **Do not** build a composite "GPS quality" score in v1. Two honest numbers beat one opaque one.

**ASSUMPTION:** exact badge thresholds (e.g. accuracy ≤ 10 m = good) are a design choice, to be validated on device; no source defines them.

## 7. Battery and thermal for screen-on driving sessions

- **Accuracy vs battery:** "the higher the accuracy, the higher the battery drain"; "the more frequent location is computed, the more battery is used"; "Less latency usually requires more battery." — https://developer.android.com/develop/sensors-and-location/location/battery
- **Priority guidance:** Google reserves `PRIORITY_HIGH_ACCURACY` for "apps that run in the foreground and require real time location updates (for example, a mapping app)" — DualDash is exactly that case. — https://developer.android.com/develop/sensors-and-location/location/battery
- **Frequency guidance:** "Reserve intervals of a few seconds for foreground use cases." A 1 s interval is at the aggressive end but inside the foreground envelope. — https://developer.android.com/develop/sensors-and-location/location/battery
- **The dominant consumer is the display, not the GPS.** Google's navigation SDK power guide states "Screen rendering usually causes the highest power consumption in mobile navigation apps." — https://developers.google.com/maps/documentation/navigation/android-sdk/optimize-power
- **Keep-screen-on is a deliberate, bounded cost:** "Keeping the device's screen on can drain the battery quickly... do so for as short a time as possible." — https://developer.android.com/develop/background-work/background-tasks/awake/screen-on

**Implications:**

1. A mount + charger is the expected driving posture (car dock behaviour: https://developer.android.com/training/monitoring-device-state/docking-monitoring). Design for plugged-in, not for 8-hour unplugged endurance.
2. Stop the location request when the app is not in the foreground — no reason to burn GNSS in a pocket.
3. Use a **dark/black background** for HUD mode: at typical OLED contrast this cuts panel power meaningfully and also improves windshield reflection legibility. (ASSUMPTION: no measured figure collected; the direction is standard display-power reasoning, to be validated with a device test if battery becomes a complaint.)
4. **Thermal:** a phone on a sunlit dash in HUD mode is a thermal-stress case. Android exposes thermal status to apps via `PowerManager.addThermalStatusListener` / `OnThermalStatusChangedListener`, from `THERMAL_STATUS_NONE` (0) upward. — https://developer.android.com/reference/android/os/PowerManager , https://developer.android.com/reference/android/os/PowerManager.OnThermalStatusChangedListener , https://source.android.com/docs/core/power/thermal-mitigation
   **Action:** listen for thermal status; on `THERMAL_STATUS_MODERATE` or above, drop non-essential work (animations, high-rate re-renders) rather than the location stream. Do not silently reduce update rate — a driver must be able to trust the number.

## 8. Open questions

- O1: HUD mirror mode render rate — is 1 Hz enough for the reflected readout, or does the driver expect continuous motion? Needs a windshield test.
- O2: Should `speedAccuracy` drive a visible confidence indicator in v1, or stay internal? (`competitors.md` gap #2 says show it.)
- O3: Foreground service for screen-off driving — in scope for v1? Depends on `stack.md` verdict.
- O4: Acceleration clamp bound (8 m/s²) and stationary thresholds (3 m / 5 s) are ASSUMPTIONs to be tuned by drive test.
