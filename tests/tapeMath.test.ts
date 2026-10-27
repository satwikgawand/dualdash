// Heading tape geometry (SPEC M2-O6): the wrap, the scale and the labels.

import { describe, expect, it } from 'vitest';
import {
  TAPE_LABEL_STEP_DEG,
  TAPE_PX_PER_DEG,
  TAPE_SAFE_BAND_PX,
  TAPE_SEGMENTS,
  TAPE_TICK_STEP_DEG,
  foldTranslateX,
  normalizeDeg,
  tapeItemX,
  tapeItems,
  tapeReadout,
  tapeTranslateX,
} from '../src/components/tapeMath';

describe('normalizeDeg', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(350)).toBe(350);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-10)).toBe(350);
  });

  it('reads garbage as north instead of NaN into a transform', () => {
    expect(normalizeDeg(Number.NaN)).toBe(0);
  });
});

describe('tapeTranslateX (compass-card direction + seam continuity)', () => {
  const PX = TAPE_PX_PER_DEG;
  const COPY = 360 * PX;

  /** Thread headings exactly as the component does — each step is handed the
   * previous translation — and return the raw translations. */
  function thread(headings: number[], start = 0): number[] {
    const out: number[] = [];
    let prev = start;
    for (const h of headings) {
      const x = tapeTranslateX(h, prev);
      out.push(x);
      prev = x;
    }
    return out;
  }

  it('parks the current heading under the index (a whole copy off, so the same tick)', () => {
    // The centred mark's track offset is a whole copy width from the index —
    // the SAME tick sits under it one copy along, which is visually exact.
    for (const h of [0, 45, 90, 180, 270, 350]) {
      const x = tapeTranslateX(h);
      expect((tapeItemX(h) + x) % COPY).toBeCloseTo(0, 6);
    }
    expect(tapeTranslateX(0)).toBe(0);
    expect(tapeTranslateX(90)).toBe(-90 * PX); // prev = 0 → the k = 0 copy
  });

  it('lays the rose out W-N-E: at north the 90° (E) mark sits to the RIGHT of the index', () => {
    // Worked example (first principles, SPEC M2-O10): facing north, E is a
    // quarter-turn to the right, so its mark must be +405 px right of centre.
    expect(tapeItemX(90) + tapeTranslateX(0)).toBeCloseTo(90 * PX, 6);
  });

  it('turning right slides the tape left: the E mark walks in from the right to the index', () => {
    const xs = thread([0, 30, 60, 90]);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThan(0);
    expect(tapeItemX(90) + xs[xs.length - 1]).toBeCloseTo(0, 6); // E reaches index
  });

  it('turning left slides the tape right', () => {
    const xs = thread([90, 60, 30, 0]);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(0);
  });

  it('keeps the follow continuous across the north seam when turning left (no copy-width lurch)', () => {
    // The owner bug: 5 → 355 used to jump the raw transform a whole copy-width
    // the wrong way. Now each 1° step slides smoothly RIGHT.
    const xs = thread([5, 4, 3, 2, 1, 0, 359, 358, 357, 356, 355]);
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      expect(d).toBeGreaterThan(0); // left turn → content right
      expect(Math.abs(d)).toBeLessThan(60); // small step, never a copy-width
    }
    expect(xs[xs.length - 1] - xs[0]).toBeCloseTo(10 * PX, 6); // net 10° left
  });

  it('keeps the follow continuous across the north seam when turning right', () => {
    const xs = thread([355, 356, 357, 358, 359, 0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      expect(d).toBeLessThan(0); // right turn → content left
      expect(Math.abs(d)).toBeLessThan(60);
    }
    expect(xs[xs.length - 1] - xs[0]).toBeCloseTo(-10 * PX, 6);
  });

  it('a full net right turn stays continuous: every 10° step slides ~45 px left, seam included', () => {
    const hs = [...Array.from({ length: 36 }, (_, i) => i * 10), 0]; // 0,10,…,350, back to 0
    const xs = thread(hs);
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      expect(d).toBeLessThan(0); // a right turn never slides content right
      expect(Math.abs(d)).toBeCloseTo(10 * PX, 6); // 45 px, including the seam step
    }
  });

  it('treats 360 as 0 — no seam reset, no jump', () => {
    expect(tapeTranslateX(360)).toBe(tapeTranslateX(0));
    expect(tapeTranslateX(359.9)).toBeCloseTo(tapeTranslateX(-0.1), 6);
  });

  it('shows about ±45° of horizon on the smallest and largest target width', () => {
    // 320 px and 412 px wide: the visible half-span in degrees.
    expect((320 / TAPE_PX_PER_DEG) / 2).toBeGreaterThan(30);
    expect((412 / TAPE_PX_PER_DEG) / 2).toBeGreaterThan(40);
    expect((412 / TAPE_PX_PER_DEG) / 2).toBeLessThan(60);
  });
});

describe('foldTranslateX (whole-copy guard, visually a no-op)', () => {
  const COPY = 360 * TAPE_PX_PER_DEG;

  it('folds back into the safe band by whole copies', () => {
    const x = -TAPE_SAFE_BAND_PX - 100; // just past the band
    const f = foldTranslateX(x, TAPE_SAFE_BAND_PX);
    expect(Math.abs(f)).toBeLessThanOrEqual(TAPE_SAFE_BAND_PX);
    expect((f - x) % COPY).toBeCloseTo(0, 6); // a whole-copy hop = same tick
  });

  it('leaves in-band values untouched', () => {
    expect(foldTranslateX(0, TAPE_SAFE_BAND_PX)).toBe(0);
    expect(foldTranslateX(-405, TAPE_SAFE_BAND_PX)).toBe(-405);
  });

  it('keeps a full net turn inside the safe band (so the window never blanks)', () => {
    let prev = 0;
    for (let i = 0; i <= 36; i++) {
      const raw = tapeTranslateX((i * 10) % 360, prev);
      const folded = foldTranslateX(raw, TAPE_SAFE_BAND_PX);
      expect(Math.abs(folded)).toBeLessThanOrEqual(TAPE_SAFE_BAND_PX);
      prev = folded; // the component commits the folded value as prev
    }
  });
});

describe('tapeItems (three-copy seamless tape)', () => {
  const items = tapeItems();

  it('draws the 8-point rose three times: a tick every 10°, a label every 45°', () => {
    expect(TAPE_TICK_STEP_DEG).toBe(10);
    expect(TAPE_LABEL_STEP_DEG).toBe(45);
    expect(TAPE_SEGMENTS).toHaveLength(3);
    // 40 items per copy: 36 ticks (every 10°) + 4 extra labelled-only ticks
    // (45°, 135°, 225°, 315°); 8 of the 40 carry a label.
    expect(items).toHaveLength(3 * 40);
    expect(items.filter((i) => i.label === null)).toHaveLength(3 * 32);
    expect(items.filter((i) => i.label !== null)).toHaveLength(3 * 8);
  });

  it('labels run N NE E SE S SW W NW', () => {
    const labels = items
      .filter((i) => i.label !== null && i.deg >= 0 && i.deg < 360)
      .map((i) => i.label);
    expect(labels).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  });

  it('covers the seam: heading 355° still has ticks and the N label ahead of it', () => {
    const ahead = items.filter((i) => i.deg >= 345 && i.deg <= 405).map((i) => i.deg);
    expect(ahead).toContain(350);
    expect(ahead).toContain(360); // the duplicated 0° of the next copy
    expect(ahead).toContain(405);
    const northLabel = items.find((i) => i.deg === 360);
    expect(northLabel?.label).toBe('N');
  });

  it('places items linearly so a translate is the only moving part', () => {
    expect(tapeItemX(45)).toBe(45 * TAPE_PX_PER_DEG);
    expect(tapeItemX(-45)).toBe(-tapeItemX(45));
  });
});

describe('tapeReadout', () => {
  it('shows the 8-point label with rounded degrees', () => {
    expect(tapeReadout(354)).toBe('N 354°');
    expect(tapeReadout(90)).toBe('E 90°');
    expect(tapeReadout(337)).toBe('NW 337°');
  });

  it('is empty when there is no course at all', () => {
    expect(tapeReadout(null)).toBe('');
    expect(tapeReadout(Number.NaN)).toBe('');
  });
});
