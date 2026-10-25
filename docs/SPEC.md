# DualDash — Living Spec

Source of truth for the project. Update this file whenever a decision changes.

## Purpose

DualDash is a standalone GPS car HUD for Android. The driver mounts the phone, opens DualDash, and reads speed, heading and trip information — either in drive mode or reflected on the windshield in HUD mirror mode. GPS only; no OBD-II adapter, no car pairing, no account.

Problem it solves: factory speedometers read in km/h or mph units the driver must translate, and cheap HUD apps are either ad-heavy, subscription-locked, or require an OBD dongle. DualDash is a clean, offline-capable speed HUD with trip logging.

## Current state

Phase: **research.** No application code yet.

Completed:

- Repository created (private, `satwikgawand/dualdash`).
- Foundation research written under `docs/research/`:
  - `competitors.md` — market scan of GPS/HUD speed apps.
  - `gps-speed.md` — Android GPS speed engineering brief.
  - `speed-limits.md` — OSM speed-limit data feasibility.
  - `stack.md` — Capacitor-vs-native-Kotlin verdict.

## Decisions

| # | Decision | Status | Basis |
| --- | --- | --- | --- |
| D1 | Name is **DualDash**. | Locked | Product owner. |
| D2 | v1 is standalone GPS only. No OBD-II. | Locked | Product scope. |
| D3 | v1 targets Android first. | Assumption | Card text says "Android car HUD app"; iOS not in scope for v1. |
| D4 | House stack leaning: PWA UI + Capacitor shell, trips to Turso. | Proposed — see `docs/research/stack.md` for the verdict | Must be argued, not assumed. |

## Next steps

1. Read the four research documents; resolve every open question below.
2. Lock D4 using the verdict in `docs/research/stack.md`.
3. Scaffold the app shell and the location pipeline.
4. Define the trip schema before writing the Turso integration.

## Open questions

- O1: Does v1 ship speed-limit display at all? `docs/research/speed-limits.md` gives the feasibility answer; product still has to decide.
- O2: km/h vs mph — default from device locale, or a first-run choice?
- O3: Does trip logging require an account/sync, or stay device-local in v1?
- O4: What is the licence?
- O5: Minimum Android version? Affects which location APIs are safe to use.
