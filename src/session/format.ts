// Session display formatting (SPEC M2-O1). Pure helpers — the summary card
// and the stats row render the same strings. Distance converts on its own
// grid (metres -> km / miles): the speed converter in src/core multiplies
// by 3.6, which would turn 400 m into "1440 km". src/core stays untouched.

import { Unit } from '../core/units';

/** Metres to miles (international yard). */
const METRES_TO_MILES = 0.000621371192;

/** Elapsed as m:ss, or h:mm:ss past an hour. Tabular-friendly, fixed width. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Distance in the driver's unit with one decimal, e.g. "12.4 km" / "7.7 mi". */
export function formatDistance(metres: number, unit: Unit): string {
  const m = Number.isFinite(metres) ? Math.max(0, metres) : 0;
  const value = unit === 'kmh' ? m / 1000 : m * METRES_TO_MILES;
  const suffix = unit === 'kmh' ? 'km' : 'mi';
  return `${value.toFixed(1)} ${suffix}`;
}
