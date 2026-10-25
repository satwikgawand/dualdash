# Competitor scan: GPS speed and HUD apps

**Executive summary.** Eight Android/iOS apps compete in the GPS-speed/HUD space. The category is crowded but weak: ratings sit between 3.3 and 4.6 stars, most apps are ad-funded or use in-app purchases, and the best-loved app (DigiHUD) was removed from Google Play on 17 February 2025 when its sole developer retired the project. HUDWAY pivoted to hardware and stopped supporting its Cast app. DualDash can own four gaps: (1) a maintained, ad-free, account-free speed HUD; (2) honest GPS-quality signalling (satellite count, accuracy, stale-fix indicator) that no incumbent shows; (3) trip history that syncs without an account; (4) speed limits later, if and only if the data cost works (see `speed-limits.md`).

Method: Google Play listing pages fetched 2026-10-25 (rating and review count read from the page's `aggregateRating` JSON-LD), plus vendor sites. Ratings move; treat these as a dated snapshot.

## The field

### 1. DigiHUD Speedometer (and DigiHUD Pro) — James Moss

- **Platform:** Android only. **Price:** free, "100% ad-free"; Pro was a paid unlock.
- **Rating (as indexed):** 4.3 stars, 78.6K reviews, 10M+ downloads. — https://play.google.com/store/apps/details?id=org.mrchops.android.digihud
- **Features:** GPS digital HUD, speed and distance, compass, profiles (Car/Walking), offline, no data connection required. — https://www.androidheadlines.com/2015/05/sponsored-app-review-digihud-speedometer.html
- **Status: dead.** The developer states Google removed the apps and his developer account from Play on 17 February 2025; last releases (1.5.13 free, 1.1.22 Pro) are only on his own site. First release ~mid-2012, 21 million downloads claimed. — http://digihud.co.uk/blog/
- **Why it matters:** this is the app DualDash most directly replaces. Its user base has no maintained home.

### 2. Navier HUD 3 — Whilerain Studio

- **Platform:** Android (6.0+). **Price:** free, contains ads, in-app purchases. — https://play.google.com/store/apps/details?id=idv.xunqun.navier
- **Rating:** 3.3 stars, 9,493 ratings, 1M+ downloads (read from listing JSON-LD, 2026-10-25). Google's own search snippet for the same listing shows 3.6/9.49K — the listing has moved between 3.5 and 3.6 historically; the live page now reads 3.3.
- **Features:** HUD mirror display, navigation (needs network), speedometer, OBD2 revs, Dartrays HUD device support. Navier HUD 2 is unmaintained. — https://play.google.com/store/apps/details?id=idv.xunqun.navier
- **Pain reported by users:** third-party review analysis flags "many low ratings mention paywalls or pricing" and a 31% share of 1–2 star ratings. — https://apprecs.com/android/idv.xunqun.navier/navier-hud-3

### 3. Speedometer by HUDWAY — HUDWAY LLC

- **Platform:** iOS and Android. **Price:** free. — https://hudway.co/apps/speedometer
- **Features:** GPS speedometer, speed-limit alerts per road segment, speed-camera/radar alerts, background operation with sound alerts, offline after first launch, HUD mirror mode. — https://hudway.co/apps/speedometer
- **Store status:** the Google Play listing did not resolve when fetched 2026-10-25 (HTTP "Not Found"); the App Store listing exists (id1025838452). Treat Android availability as uncertain.
- **Angle:** the only incumbent that markets speed limits as the core feature. Cost and coverage are unproven publicly — see `speed-limits.md`.

### 4. HUDWAY Go — HUDWAY LLC

- **Platform:** Android, iOS. **Price:** free, ads + in-app purchases. — https://play.google.com/store/apps/details?id=com.hudway.online
- **Rating:** 3.6 stars, 3.88K reviews, 1M+ downloads (listing JSON-LD, 2026-10-25).
- **Features:** GPS navigation with HUD mode, route view, manoeuvre alerts. — https://hudway.co/apps/go
- **Status:** removed from Google Play on 2025-03-19 (1,397,530 installs recorded before removal). — https://chrome-stats.com/d/com.hudway.online

### 5. HUDWAY Cast — HUDWAY LLC

- **Platform:** iOS only. **Price:** free. — https://apps.apple.com/us/app/hudway-cast-safe-driving/id1258579266 (2.9 stars, 39 ratings)
- **Function:** companion app for the Cast hardware; streams navigation, calls, music to the device.
- **Status: unsupported.** HUDWAY's help centre, updated 5 July 2024, states "We no longer support HUDWAY Cast. At the moment we only produce and update the HUDWAY Drive heads-up display." — https://hudway.zendesk.com/hc/en-us/articles/360008089179-HUDWAY-Cast-vs-HUDWAY-Drive
- **Hardware context:** HUDWAY Drive devices run $329–$399 in the company store. — https://store.hudway.co/products/

### 6. GPS Speedometer : Odometer HUD — KTW Apps

- **Platform:** Android. **Price:** free, ads + in-app purchases. — https://play.google.com/store/apps/details?id=com.ktwapps.speedometer
- **Rating:** 4.6 stars, 61,326 ratings (listing JSON-LD 4.5636 / 61326, 2026-10-25).
- **Features:** real-time speed, average and top speed, distance, trip duration, units mph/km/h/knots/m/s, works offline, trip odometer, travel history save. — https://play.google.com/store/apps/details?id=com.ktwapps.speedometer
- **Note:** the strongest-rated large-install base in the set, but monetised by ads and IAP.

### 7. HUD Speedometer Speed Monitor — FUNNY APPS

- **Platform:** Android. **Price:** free, ads + in-app purchases. — https://play.google.com/store/apps/details?id=com.funapps.hud
- **Rating:** 4.4 stars, 7,159 ratings, 500K+ downloads (listing JSON-LD 4.4286 / 7159, 2026-10-25).
- **Features:** digital speedometer with HUD mode, speed monitoring, vehicle mileage record for the journey. — https://play.google.com/store/apps/details?id=com.funapps.hud

### 8. GPS HUD Speedometer — Galaxy studio apps

- **Platform:** Android. **Price:** free, ads + in-app purchases. — https://play.google.com/store/apps/details?id=oops.hudspeedometer
- **Rating:** 4.5 stars, 12,906 ratings, 1M+ downloads (listing JSON-LD, 2026-10-25).
- **Features:** GPS speed meter, km/h odometer, HUD display. — https://play.google.com/store/apps/details?id=oops.hudspeedometer

### Also in the set (paid / niche)

- **GPS HUD Speedometer Plus** — AscendApps, Android, **$3.99** one-time purchase, 4.4 stars, 543 ratings, 10K+ installs. — https://play.google.com/store/apps/details?id=com.ascendapps.aaspeedometer.pro
- **GPS Speedometer Premium** — nclear, Android, free with in-app purchases, 2.96K ratings, 500K+ installs. — https://play.google.com/store/apps/details?id=com.nclear.gps
- **Free HUD Speed Display** — Duminda Kuruppu, Android, free, 50+ installs; mirrored text, km/h–mph switch, always-on. — https://play.google.com/store/apps/details?id=com.speed.freehuddisplay

## What the field looks like as a whole

| Signal | Evidence |
| --- | --- |
| Ratings cluster at 3.3–4.6 | Live listing JSON-LD, 2026-10-25 (see per-app rows) |
| Ads + IAP is the norm | Navier, KTW, FUNNY APPS, Galaxy studio, HUDWAY Go all show "Contains ads / In-app purchases" on their listings |
| Two top apps vanished from Play | DigiHUD removed 2025-02-17 (http://digihud.co.uk/blog/); HUDWAY Go removed 2025-03-19 (https://chrome-stats.com/d/com.hudway.online) |
| Hardware lock-in is HUDWAY's model | HUDWAY Drive $329–$399 (https://store.hudway.co/products/); Cast app unsupported since 2024-07-05 |
| Nobody leads on data quality | No listing in this set advertises satellite count, accuracy readout, or a stale-fix indicator |

## Gaps DualDash can own

1. **A maintained, ad-free, account-free HUD.** The best-regarded incumbent (DigiHUD) is gone from Play; the survivors monetise with ads and IAP and rate 3.3–4.6. DualDash ships clean and stays maintainable.
2. **Honest GPS quality signalling.** Show accuracy, satellite count and a "stale / no fix" state (see `gps-speed.md`). No competitor lists this as a feature; it is the difference between a number a driver trusts and one they do not.
3. **Trip history without an account.** KTW offers travel history; none of these apps offer sync that does not push the user into an account or a subscription. Local-first trips with optional Turso sync is open ground.
4. **Speed limits, later and only if the data is cheap.** HUDWAY claims offline speed-limit awareness; nobody in the set publishes their data source or coverage. `speed-limits.md` gives the feasibility answer for OSM vs commercial feeds.
5. **Scope discipline.** Navier and HUDWAY Go bundle navigation, OBD2, hardware pairing — complexity that drags ratings down. DualDash v1 is deliberately narrow: speed, heading, location, trips.

## Open questions

- O1: Is "ad-free" a launch claim or a v1-only claim? Monetisation is undecided (SPEC open question).
- O2: Does the DigiHUD user base still exist in numbers worth targeting? 21M lifetime downloads is a developer claim (http://digihud.co.uk/blog/), not a current-active-user figure.
- O3: Should DualDash import DigiHUD-style display profiles (Car/Walking) in v1, or is one driving profile enough?
