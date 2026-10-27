// Pure presentation math for the rolling odometer readout (SPEC M1-O8,
// direction-aware roll in SPEC M2-O5).
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
 * Strip geometry (SPEC M2-O5). The 0-9 strip is drawn as 31 cells: three
 * copies of 0-9 plus the closing 0 of the last copy. A digit travels at most
 * 9 cells in one roll, so the extra copies let a roll pass the 9 -> 0 seam in
 * either direction without the strip running out of cells.
 *
 * The resting window sits on the middle copy: strip index [ROLL_MIN_INDEX,
 * ROLL_MAX_INDEX] shows digits 0-9. While at rest the position is recentred
 * back into that band with an invisible +/-10-cell jump (identical digits,
 * transition off) so a long drive never walks the strip off the end.
 */
export const ROLL_STRIP_CELLS = 31;
/** Strip index of the middle copy's 0 cell — the resting base of a digit. */
export const ROLL_REST_BASE = 10;
export const ROLL_MIN_INDEX = 10;
export const ROLL_MAX_INDEX = 19;
/** One recentre jump: ten cells is one full 0-9 copy, i.e. the same digits. */
export const ROLL_RECENTRE_STEP = 10;
/** Extra slack after the last column settles before the invisible recentre. */
export const ROLL_RECENTRE_GRACE_MS = 40;

/**
 * Roll direction. Accelerating strips advance upward (the digit climbs the
 * strip, so 9 rolls up through the wrap to 0); decelerating strips descend
 * (0 rolls down through the wrap to 9). "neutral" means no travel direction
 * is known: first paint, an unchanged speed, or a unit toggle — the field
 * then takes the shortest path, or does not move at all.
 */
export type RollDirection = 'up' | 'down' | 'neutral';

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
 * Travel direction for one sample pair, from the speed change alone (SPEC
 * M2-O5). A unit toggle redraws the field without a speed change, so it lands
 * in 'neutral' and the digits take the shortest path — never a spurious full
 * spin in either direction.
 */
export function rollDirection(prevMps: number | null, nextMps: number): RollDirection {
  if (prevMps === null || !Number.isFinite(prevMps) || !Number.isFinite(nextMps)) {
    return 'neutral';
  }
  if (nextMps > prevMps) return 'up';
  if (nextMps < prevMps) return 'down';
  return 'neutral';
}

/**
 * Signed cell travel for one digit, in the roll direction.
 * - up: 0..9 cells, always climbing (9 -> 0 costs 1 cell, not 9).
 * - down: -9..0 cells, always descending (0 -> 9 costs -1 cell).
 * - neutral: the shortest path (ties go up), used when no direction is known.
 */
export function digitDelta(fromDigit: number, toDigit: number, dir: RollDirection): number {
  const forward = ((toDigit - fromDigit) % 10 + 10) % 10; // 0..9, climbing
  if (dir === 'up') return forward;
  if (dir === 'down') return forward === 0 ? 0 : forward - 10; // -9..0, descending
  return forward > 5 ? forward - 10 : forward; // shortest path, ties climb
}

/** Absolute strip index the window should show for `digit`, rolling from
 * `currentIndex` in `dir`. The result stays inside the 31-cell strip. */
export function stepRollPosition(currentIndex: number, digit: number, dir: RollDirection): number {
  return currentIndex + digitDelta(currentIndex % 10, digit, dir);
}

/**
 * Recentre a resting position onto the middle copy. Ten cells is one full
 * 0-9 copy, so the jump shows identical digits; the component renders it
 * with the transition off, at rest, which makes it invisible.
 */
export function recenterRollPosition(pos: number): number {
  let p = pos;
  while (p < ROLL_MIN_INDEX) p += ROLL_RECENTRE_STEP;
  while (p > ROLL_MAX_INDEX) p -= ROLL_RECENTRE_STEP;
  return p;
}

/** Strip cell contents: cell i shows digit i mod 10. */
export function rollStripCells(cells: number = ROLL_STRIP_CELLS): number[] {
  return Array.from({ length: cells }, (_, i) => i % 10);
}

/** CSS transform that puts strip cell `pos` in the digit window (cells are 1em tall). */
export function rollTransform(pos: number): string {
  return `translateY(-${pos}em)`;
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
