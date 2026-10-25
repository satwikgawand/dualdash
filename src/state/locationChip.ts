// Location chip state map (SPEC M1-O7): permission x provider x watch x last
// error x fix age -> exactly one honest chip.
//
// Pure module: no React, no Capacitor. It reads the fix-age machine's
// LIVE/STALE/LOST output (src/core) and never changes it — the pipeline math
// stays untouched. The four driver-facing states are
//
//   LOCATION NEEDED  permission not answered yet        [Allow]
//   LOCATION DENIED  permission refused (maybe forever) [Retry] + instructions
//   LOCATION OFF     device Location services disabled  [Re-check]
//   SEARCHING        watching, no fix yet
//   SIGNAL LOST      had a fix, it is now STALE or LOST  "last fix <age>"
//
// Precedence is deliberate: act on what the user can fix first (denied, then
// services off, then permission), then report fix health.

import type { FixState } from '../core/types';
import type { LocationPermissionState } from '../platform/SpeedSource';
import { effectsForErrorCode } from '../platform/locationErrors';

export type ChipState =
  | 'LOCATION_NEEDED'
  | 'LOCATION_DENIED'
  | 'LOCATION_OFF'
  | 'SEARCHING'
  | 'SIGNAL_LOST'
  | 'NONE';

/** Button behind the chip, if the state has one. */
export type ChipAction = 'allow' | 'retry' | 'recheck' | null;

export interface ChipInput {
  permission: LocationPermissionState;
  /** null = not checked yet. */
  providerEnabled: boolean | null;
  watchActive: boolean;
  /** Last native error code, or null when clean. */
  lastErrorCode: string | null;
  fixState: FixState;
  /** Milliseconds since the last accepted fix; null = never had one. */
  fixAgeMs: number | null;
}

export interface ChipView {
  state: ChipState;
  /** Chip headline, or null when nothing needs saying (healthy + live). */
  label: string | null;
  /** Second line: what to do, or the live chain detail. */
  hint: string | null;
  action: ChipAction;
}

/** Human fix age: '<1 s', '12 s', '4 m'. */
export function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 1000) return '<1 s';
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)} s`;
  return `${Math.round(ageMs / 60_000)} m`;
}

/**
 * Map the chain + fix state to one chip. An error code only fills a state the
 * diagnostics do not already know (permission 'unknown' / provider null), so a
 * stale code can never mask a provider that has since come back on.
 */
export function chipFor(input: ChipInput): ChipView {
  const effects = effectsForErrorCode(input.lastErrorCode);
  const permission =
    input.permission === 'unknown' && effects.permission !== undefined
      ? effects.permission
      : input.permission;
  const providerEnabled =
    input.providerEnabled === null && effects.providerEnabled !== undefined
      ? effects.providerEnabled
      : input.providerEnabled;

  if (permission === 'denied') {
    return {
      state: 'LOCATION_DENIED',
      label: 'LOCATION DENIED',
      hint: 'Location is blocked for DualDash. Allow it in Android Settings > Apps > DualDash > Permissions, then tap Retry.',
      action: 'retry',
    };
  }

  if (providerEnabled === false) {
    return {
      state: 'LOCATION_OFF',
      label: 'LOCATION OFF',
      hint: 'Turn Location on in the quick-settings panel, then tap Re-check.',
      action: 'recheck',
    };
  }

  if (permission !== 'granted') {
    return {
      state: 'LOCATION_NEEDED',
      label: 'LOCATION NEEDED',
      hint: 'Grant location access so DualDash can read speed.',
      action: 'allow',
    };
  }

  if (input.fixAgeMs !== null) {
    if (input.fixState === 'LIVE') return { state: 'NONE', label: null, hint: null, action: null };
    return {
      state: 'SIGNAL_LOST',
      label: `SIGNAL LOST — last fix ${formatAge(input.fixAgeMs)}`,
      hint: null,
      action: null,
    };
  }

  // Granted, services on, no fix yet: say what the chain is doing instead of
  // pretending it is dead.
  const parts = [input.watchActive ? 'watching' : 'starting watch'];
  if (input.lastErrorCode !== null) parts.push(`last error ${input.lastErrorCode}`);
  return {
    state: 'SEARCHING',
    label: 'SEARCHING',
    hint: parts.join(' · '),
    action: null,
  };
}
