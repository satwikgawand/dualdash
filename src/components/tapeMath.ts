// Pure geometry for the full-width heading tape (SPEC M2-O6). No React, no
// DOM: the node suite exercises the wrap maths directly. The compass ring is
// gone; Drive mode now shows a horizontal tape that scrolls under a fixed
// centre index, so the heading you are on always sits in the middle.
//
// Seamless wrap: the tape is drawn three times (-360°, 0°, +360°) and the
// track is translated by the heading. The visible window never leaves the
// drawn copies (it spans about ±100° at 4.5 px/deg), so the 0°/360° seam is
// never on screen — no modulo reset, no jump.
//
// Steady-state direction + seam continuity (SPEC M2-O10 seam rule; natural
// rose restored in M2-O11): the rose is laid out W-N-E — degrees increase to
// the RIGHT of the fixed centre index — so the tape content slides OPPOSITE
// to the rotation. Turn right (heading rises) -> content slides LEFT and the
// mark being turned toward walks in from the RIGHT edge to the index; turn
// left -> content slides RIGHT. This needs no display compensation because
// the heading data is a true azimuth now: it is normalised once at the
// source (`orientation.ts`, M2-O11), so the phone's compass and the GPS
// course rise on a right turn like the paper compass card assumes. The M2-O10
// amendment mirrored the rose to compensate for heading data that FELL while
// the phone turned right — that mirror put west right of north, so it is
// undone here. The follow transition animates the *numeric* transform, so `tapeTranslateX`
// must stay continuous across the 0°/360° seam or the 250 ms CSS transition
// scrolls a whole copy-width the wrong way on a north crossing. The maths
// picks the tape copy nearest the previous frame to keep the transform
// continuous (see the function doc).

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
/** One full rose in px — the width of a single tape copy (360° × px/deg).
 * Because the rose repeats every copy, a track translation is only defined up
 * to a whole multiple of this width: adding or subtracting it lands the very
 * same tick under the index. Seam continuity (M2-O10) leans on exactly that. */
export const TAPE_COPY_PX = 360 * TAPE_PX_PER_DEG;
/** Half-band (deg) the three drawn copies can always cover, centred on the
 * current heading. Beyond this a long NET turn would walk the visible window
 * (±~46° at 412 px) off the end of the tape and blank it, so the caller folds
 * the translation back by whole copies — a visually-identical hop (M2-O10).
 * 300° leaves ~54° of margin inside the ±(360+46)° the copies can show. */
export const TAPE_SAFE_HALF_DEG = 300;
/** The safe half-band in px, for `foldTranslateX`. */
export const TAPE_SAFE_BAND_PX = TAPE_SAFE_HALF_DEG * TAPE_PX_PER_DEG;
/** Follow time for one heading change — the odometer family's settle band. */
export const TAPE_FOLLOW_MS = 250;
export const TAPE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Heading into [0, 360). Defensive: a non-finite input reads as north. */
export function normalizeDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/**
 * Track translation in px — seam-safe (SPEC M2-O10). The track is anchored at
 * the container's centre (left: 50%), and the rose is laid out W-N-E (degrees
 * increase to the RIGHT of the index — `tapeItemX`), so translating by
 * −heading·px-per-deg parks the current heading exactly under the fixed index.
 * Direction (natural rose, SPEC M2-O11): heading rises -> the translation
 * falls -> content slides LEFT; heading falls -> content slides RIGHT. That is
 * the compass-card sign and it matches the HUD arrow (`rotate(-heading)`).
 * The M2-O10 amendment used +heading because the data then FELL while the
 * phone turned right; M2-O11 fixes the data at the source, so the display
 * mirror goes back to the natural sign.
 *
 * Because the rose is drawn three times, the translation is only defined up to
 * a whole copy width (TAPE_COPY_PX) — hopping by one copy lands the identical
 * tick under the index. We pick the copy whose translation lies NEAREST the
 * previous frame's, which keeps the raw transform continuous: a small heading
 * step always produces a small, correctly-directed slide, including across the
 * 0°/360° seam. (Re-centering into a fixed band on every step is NOT done
 * here — it would snap a whole copy wide on a mid-turn step and kill the
 * follow animation; guarding the far end against blanking is the caller's
 * rare, transition-suppressed fold.)
 *
 * Why nearest-copy matters: the CSS follow transition animates the *numeric*
 * transform, not the wrapped heading. Normalising into [0, 360) on its own
 * makes the raw transform jump a whole copy width whenever the heading wraps
 * through north, so the 250 ms transition scrolled the tape a full width the
 * WRONG way on a seam crossing (owner report: "when I move left, it scrolls
 * left"). Nearest-copy keeps the transform continuous, so the transition
 * always animates the short, correctly-directed slide.
 *
 * @param prevTranslateX the previous frame's translation (0 when unknown), so
 * the copy choice can stay continuous. Pure: no hidden state, fully testable.
 */
export function tapeTranslateX(
  headingDeg: number,
  prevTranslateX: number = 0,
  pxPerDeg: number = TAPE_PX_PER_DEG,
): number {
  const copy = 360 * pxPerDeg;
  const base = -normalizeDeg(headingDeg) * pxPerDeg; // the k = 0 copy, ∈ [-copy, 0]
  // Nearest whole-copy offset to the previous frame → continuous transform.
  const x = base + Math.round((prevTranslateX - base) / copy) * copy;
  return x === 0 ? 0 : x; // not -0: the value goes straight into a transform
}

/**
 * Fold a translation back into the drawn copies by whole copy widths (SPEC
 * M2-O10). A whole-copy hop lands the identical tick under the index, so this
 * NEVER changes what is on screen — it only keeps the numeric transform inside
 * the ±(window) band the three copies can cover, so a long net turn cannot
 * walk the tape off the end and blank the window. The caller must apply the
 * folded value with the follow transition suppressed (it is a no-op visually).
 *
 * `maxAbsX` is the safe half-band in px; returns the folded value, which is
 * within `maxAbsX` of `x` modulo whole copies.
 */
export function foldTranslateX(
  x: number,
  maxAbsX: number,
  pxPerDeg: number = TAPE_PX_PER_DEG,
): number {
  const copy = 360 * pxPerDeg;
  let folded = x;
  while (folded > maxAbsX) folded -= copy;
  while (folded < -maxAbsX) folded += copy;
  return folded === 0 ? 0 : folded;
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

/** Horizontal offset of a tape item from the track's own 0°, in px. Natural
 * rose (SPEC M2-O11): degrees increase to the RIGHT of the index — west sits
 * left of north, east right of north. */
export function tapeItemX(deg: number, pxPerDeg: number = TAPE_PX_PER_DEG): number {
  return deg * pxPerDeg;
}

/** Centre readout: "N 354°". Empty when there is no course at all. */
export function tapeReadout(headingDeg: number | null): string {
  if (headingDeg === null || !Number.isFinite(headingDeg)) return '';
  return `${compassLabel(headingDeg)} ${Math.round(normalizeDeg(headingDeg))}°`;
}
