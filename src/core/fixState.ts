// Fix-age state machine (gps-speed.md section 5).
// Rule: NEVER render 0.0 for a missing fix. Zero is a legitimate parked
// reading; a missing fix must be shown as frozen-last-good plus a NO FIX chip.

import { FixState, PIPELINE } from './types';

/** Classify a fix age in milliseconds into LIVE / STALE / LOST. */
export function fixStateForAge(ageMs: number | null): FixState {
  if (ageMs === null || !Number.isFinite(ageMs)) return 'LOST';
  if (ageMs <= PIPELINE.LIVE_MAX_AGE_MS) return 'LIVE';
  if (ageMs <= PIPELINE.STALE_MAX_AGE_MS) return 'STALE';
  return 'LOST';
}

/** Should the UI show the "NO FIX" chip for this state? */
export function showNoFixFor(state: FixState): boolean {
  return state === 'STALE' || state === 'LOST';
}
