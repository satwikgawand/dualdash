// Pure geometry for the full-width heading tape (SPEC M2-O6). No React, no
// DOM: the node suite exercises the wrap maths directly. The compass ring is
// gone; Drive mode now shows a horizontal tape that scrolls under a fixed
// centre index, so the heading you are on always sits in the middle.
//
// Seamless wrap: the tape is drawn three times (-360°, 0°, +360°) and the
// track is translated by the heading. The visible window never leaves the
// middle copy (it spans about ±100° at 4.5 px/deg), so the 0°/360° seam is
// never on screen — no modulo reset, no jump.

import { compassLabel } from '../core/units';

/** Pixels per degree. 4.5 px/deg puts ~±45° of horizon in view at 320-412 px:
 * far enough ahead to read a turn coming, tight enough that the letters stay
 * legible at a glance. */
export const TAPE_PX_PER_DEG = 4.5;
/** Minor tick every 10°. */
export const TAPE_TICK_STEP_DEG = 10;
/** Labelled tick every 45° (the full 8-point rose: N NE E SE S SW W NW). */
export const TAPE_LABEL_STEP_DEG = 45;
/** Three copies of the rose: one in view, one either side of the seam. */
export const TAPE_SEGMENTS = [-1, 0, 1] as const;
/** Follow time for one heading change — the odometer family's settle band. */
export const TAPE_FOLLOW_MS = 250;
export const TAPE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Heading into [0, 360). Defensive: a non-finite input reads as north. */
export function normalizeDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/**
 * Track translation in px. The track is anchored at the container's centre
 * (left: 50%), so translating by -heading·px-per-deg parks the current
 * heading exactly under the fixed index.
 */
export function tapeTranslateX(headingDeg: number, pxPerDeg: number = TAPE_PX_PER_DEG): number {
  const x = normalizeDeg(headingDeg) * pxPerDeg;
  return x === 0 ? 0 : -x; // not -0: the value goes straight into a transform
}

export interface TapeItem {
  /** Stable key: `${segment}:${degree}`. */
  id: string;
  /** Unnormalised degree position (may be outside 0-360). */
  deg: number;
  /** Offset from the segment's own 0°, for the tick/label geometry. */
  label: string | null;
}

/** Every tick on the three-copy tape: a label at each 45°, a tick each 10°.
 * 10° and 45° do not share a step, so the walk is 5° and keeps the union —
 * 40 items per copy, 8 of them labelled. */
export const TAPE_WALK_STEP_DEG = 5;

/** Every tick on the three-copy tape. Positions are the view's job
 * (`tapeItemX`); this lists the content. */
export function tapeItems(): TapeItem[] {
  const items: TapeItem[] = [];
  for (const segment of TAPE_SEGMENTS) {
    for (let deg = 0; deg < 360; deg += TAPE_WALK_STEP_DEG) {
      const isTick = deg % TAPE_TICK_STEP_DEG === 0;
      const isLabel = deg % TAPE_LABEL_STEP_DEG === 0;
      if (!isTick && !isLabel) continue;
      items.push({
        id: `${segment}:${deg}`,
        deg: deg + segment * 360,
        label: isLabel ? compassLabel(deg) : null,
      });
    }
  }
  return items;
}

/** Horizontal offset of a tape item from the track's own 0°, in px. */
export function tapeItemX(deg: number, pxPerDeg: number = TAPE_PX_PER_DEG): number {
  return deg * pxPerDeg;
}

/** Centre readout: "N 354°". Empty when there is no course at all. */
export function tapeReadout(headingDeg: number | null): string {
  if (headingDeg === null || !Number.isFinite(headingDeg)) return '';
  return `${compassLabel(headingDeg)} ${Math.round(normalizeDeg(headingDeg))}°`;
}
