# DualDash

DualDash is a standalone GPS car HUD for Android. It shows speed, heading and location, logs trips, and works in HUD mirror mode (windshield reflection) and drive mode. No OBD-II adapter or car pairing is required — GPS only.

**Status: research phase.** No application code yet. The plan, decisions and open questions live in [`docs/SPEC.md`](docs/SPEC.md). Research findings live in [`docs/research/`](docs/research/).

## What v1 does

- Speed readout from GPS, large enough to read while driving.
- HUD mirror mode (mirrored image for windshield reflection) and drive mode.
- Heading / compass direction.
- Trip stats: distance, duration, average speed, start/end.
- Trip logging, persisted per device.

## What v1 does not do

- No OBD-II / car diagnostics.
- No turn-by-turn navigation.
- No speed-limit warnings (see `docs/research/speed-limits.md` for why).

## Repository layout

| Path | Contents |
| --- | --- |
| `README.md` | This file. |
| `docs/SPEC.md` | Living spec: purpose, current state, decisions, next steps, open questions. |
| `docs/research/` | Foundation research: competitors, GPS speed, OSM speed limits, stack verdict. |

## Research documents

- `docs/research/competitors.md` — existing GPS/HUD speed apps, their features and pricing, and the gaps DualDash can own.
- `docs/research/gps-speed.md` — how to turn Android location callbacks into a stable, readable speed value.
- `docs/research/speed-limits.md` — OSM speed limits: usage, quotas, attribution, offline caching, commercial alternatives.
- `docs/research/stack.md` — v1 requirements and the Capacitor-vs-native-Kotlin verdict.

## Licence

TBD. Repository is private.
