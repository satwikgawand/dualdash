// Heading tape geometry (SPEC M2-O6): the wrap, the scale and the labels.

import { describe, expect, it } from 'vitest';
import {
  TAPE_LABEL_STEP_DEG,
  TAPE_PX_PER_DEG,
  TAPE_SEGMENTS,
  TAPE_TICK_STEP_DEG,
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

describe('tapeTranslateX (fixed centre index)', () => {
  it('parks the current heading under the index', () => {
    expect(tapeTranslateX(0)).toBe(0);
    expect(tapeTranslateX(90)).toBe(-90 * TAPE_PX_PER_DEG);
    expect(tapeTranslateX(350)).toBe(-350 * TAPE_PX_PER_DEG);
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
