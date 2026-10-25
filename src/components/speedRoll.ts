// Pure presentation math for the rolling odometer readout (SPEC M1-O8).
// No React, no DOM: the node test suite exercises it directly. This lives in
// components, not core, because it is display formatting — the GPS pipeline
// (src/core) has no stake in how a rounded number is drawn.

import { Unit, convert } from '../core/units';

/** Digit slots before a value needs a wider field (odometer style, e.g. 019). */
export const MIN_DIGIT_SLOTS = 3;
/** One strip roll in ms. Inside the 250-400 ms band; settles before the next 1 Hz sample. */
export const ROLL_DURATION_MS = 320;
/** Extra delay per digit slot, left to right (slight cascade). */
export const ROLL_STAGGER_MS = 30;
/** Ease-out with no overshoot: quick start, gentle settle, never a bounce. */
export const ROLL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * The displayed number, rounded exactly as before the animation existed.
 * Defensive: DisplayState never carries NaN, but a non-finite or negative
 * input must still render a digit, not a broken strip.
 */
export function roundSpeed(mps: number, unit: Unit): number {
  const value = convert(mps, unit);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

/**
 * Split the displayed speed into one digit per odometer slot, left-padded
 * with zeros to at least MIN_DIGIT_SLOTS (so 19 km/h renders as 019 and the
 * field width never shifts as digits change). Values wider than the minimum
 * (above 999) grow the field instead of truncating: honest data beats a fixed
 * frame.
 */
export function speedDigitSlots(
  mps: number,
  unit: Unit,
  minSlots: number = MIN_DIGIT_SLOTS,
): number[] {
  const text = roundSpeed(mps, unit).toString();
  const slots = Math.max(minSlots, text.length);
  return text.padStart(slots, '0').split('').map(Number);
}

/**
 * CSS transition for one digit strip.
 * - reduced motion: instant swap ('none'), per the OS accessibility setting.
 * - not animating (first paint, or a frozen STALE/LOST hold): 'none', so a
 *   digit never rolls from a position the driver never saw.
 */
export function digitTransition(
  index: number,
  opts: { reducedMotion: boolean; animate: boolean },
): string {
  if (opts.reducedMotion || !opts.animate) return 'none';
  return `transform ${ROLL_DURATION_MS}ms ${ROLL_EASING} ${index * ROLL_STAGGER_MS}ms`;
}

/**
 * Worst-case time for a field of `slots` digits to settle. The pipeline feeds
 * a new sample every ~1 s, so this must stay well under that — the readout is
 * always at rest by the time the next value arrives.
 */
export function maxSettleMs(slots: number): number {
  return ROLL_DURATION_MS + Math.max(0, slots - 1) * ROLL_STAGGER_MS;
}
