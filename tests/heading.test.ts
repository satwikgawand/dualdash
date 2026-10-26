// Table-driven tests for the compass heading filter (SPEC M2-O4): circular
// smoothing across the 0/360 seam, the speed-based suppression gate, the
// hold-while-suppressed behaviour and the long-suppression re-seed.
// Degrees are never averaged naively — the seam rows prove it.

import { describe, expect, it } from 'vitest';
import { HeadingFilter, headingDeltaDeg } from '../src/session/heading';
import { HEADING } from '../src/session/constants';

const SPEED = 15; // m/s, well above the 3 m/s gate

describe('heading: circular smoothing', () => {
  const cases: Array<{
    name: string;
    /** [heading deg, tMs] samples. */
    samples: Array<[number, number]>;
    /** The result must sit within this many degrees of `near`. */
    near: number;
    within: number;
  }> = [
    {
      name: 'steady heading tracks the input exactly',
      samples: [
        [90, 0],
        [90, 1000],
        [90, 2000],
      ],
      near: 90,
      within: 0.01,
    },
    {
      name: '359 -> 1 crosses the seam near 0, never via 180',
      samples: [
        [359, 0],
        [1, 1000],
      ],
      near: 0,
      within: 0.1,
    },
    {
      name: '1 -> 359 crosses the seam near 0 from the other side',
      samples: [
        [1, 0],
        [359, 1000],
      ],
      near: 0,
      within: 0.1,
    },
    {
      name: '350 -> 10 eases through north (short arc), not south',
      samples: [
        [350, 0],
        [10, 1000],
      ],
      near: 0,
      within: 10.1,
    },
    {
      name: 'a full second turn converges on the new heading',
      samples: [
        [0, 0],
        [90, 1000],
        [90, 2000],
        [90, 3000],
        [90, 4000],
        [90, 5000],
        [90, 6000],
        [90, 7000],
        [90, 8000],
        [90, 9000],
        [90, 10_000],
      ],
      near: 90,
      within: 1,
    },
    {
      name: 'heading normalization: 450 deg reports 90',
      samples: [
        [450, 0],
        [450, 1000],
      ],
      near: 90,
      within: 0.01,
    },
  ];

  it.each(cases)('$name', ({ samples, near, within }) => {
    const f = new HeadingFilter();
    let out: number | null = null;
    for (const [deg, t] of samples) {
      out = f.push({ headingDeg: deg, speedMps: SPEED, tMs: t });
    }
    expect(out).not.toBeNull();
    expect(headingDeltaDeg(out!, near)).toBeLessThanOrEqual(within);
  });

  it('the naive arithmetic mean of 359 and 1 is 180 — the filter is not that', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: 359, speedMps: SPEED, tMs: 0 });
    const filtered = f.push({ headingDeg: 1, speedMps: SPEED, tMs: 1000 });
    const naive = (359 + 1) / 2;
    expect(filtered).not.toBeNull();
    expect(headingDeltaDeg(filtered!, 0)).toBeLessThan(0.1);
    expect(naive).toBe(180); // the trap this filter exists to avoid
  });
});

describe('heading: low-speed suppression ("--")', () => {
  const cases: Array<{
    name: string;
    speedMps: number;
    headingDeg: number | null;
    expectSuppressed: boolean;
  }> = [
    {
      name: '3 m/s passes the gate (threshold is inclusive)',
      speedMps: 3,
      headingDeg: 90,
      expectSuppressed: false,
    },
    { name: '2.99 m/s is suppressed', speedMps: 2.99, headingDeg: 90, expectSuppressed: true },
    { name: '0 m/s is suppressed', speedMps: 0, headingDeg: 90, expectSuppressed: true },
    {
      name: 'a fix without a heading is suppressed at any speed',
      speedMps: 20,
      headingDeg: null,
      expectSuppressed: true,
    },
    { name: 'NaN speed is suppressed', speedMps: NaN, headingDeg: 90, expectSuppressed: true },
    { name: 'NaN heading is suppressed', speedMps: 20, headingDeg: NaN, expectSuppressed: true },
  ];

  it.each(cases)('$name', ({ speedMps, headingDeg, expectSuppressed }) => {
    const f = new HeadingFilter();
    // Seed first at speed, so suppression alone decides the output.
    f.push({ headingDeg: 90, speedMps: SPEED, tMs: 0 });
    const out = f.push({ headingDeg, speedMps, tMs: 1000 });
    expect(out === null).toBe(expectSuppressed);
    expect(f.isSuppressed()).toBe(expectSuppressed);
  });

  it('suppression holds the last heading (the ring keeps its orientation)', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: 90, speedMps: SPEED, tMs: 0 });
    const out = f.push({ headingDeg: 90, speedMps: 1, tMs: 1000 });
    expect(out).toBeNull();
    expect(f.value()).not.toBeNull();
    expect(headingDeltaDeg(f.value()!, 90)).toBeLessThan(0.01);
  });

  it('a fresh filter outputs null until the first usable sample', () => {
    const f = new HeadingFilter();
    expect(f.push({ headingDeg: 90, speedMps: 1, tMs: 0 })).toBeNull();
    expect(f.value()).toBeNull();
    expect(f.isSuppressed()).toBe(true);
  });
});

describe('heading: re-seed after a long suppression', () => {
  it('suppression longer than 30 s re-seeds from the new sample', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: 0, speedMps: SPEED, tMs: 0 });
    // 40 s parked (suppressed since t=20_000); the car was turned around.
    f.push({ headingDeg: 0, speedMps: 0, tMs: 20_000 });
    f.push({ headingDeg: 0, speedMps: 0, tMs: 40_000 });
    // Drives again on the opposite heading: snap, not ease.
    const out = f.push({ headingDeg: 180, speedMps: SPEED, tMs: 55_000 });
    expect(out).not.toBeNull();
    expect(headingDeltaDeg(out!, 180)).toBeLessThan(0.01);
  });

  it('a short suppression keeps smoothing (no snap at a red light)', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: 0, speedMps: SPEED, tMs: 0 });
    f.push({ headingDeg: 0, speedMps: 0, tMs: 1000 }); // brief stop
    const out = f.push({ headingDeg: 90, speedMps: SPEED, tMs: 6000 });
    expect(out).not.toBeNull();
    // Blended from the old heading: close to 90 but not snapped to it.
    expect(headingDeltaDeg(out!, 90)).toBeLessThanOrEqual(3);
    expect(headingDeltaDeg(out!, 0)).toBeGreaterThan(50);
  });

  it('HEADING constants are the contract numbers', () => {
    expect(HEADING.MIN_SPEED_MPS).toBe(3);
    expect(HEADING.TAU_MS).toBe(1500);
    expect(HEADING.RESEED_AFTER_SUPPRESSED_MS).toBe(30_000);
  });
});

describe('heading: headingDeltaDeg helper', () => {
  const cases: Array<{ a: number; b: number; want: number }> = [
    { a: 0, b: 0, want: 0 },
    { a: 359, b: 1, want: 2 },
    { a: 1, b: 359, want: 2 },
    { a: 0, b: 180, want: 180 },
    { a: 90, b: 270, want: 180 },
    { a: 10, b: 350, want: 20 },
    { a: 350, b: 10, want: 20 },
  ];

  it.each(cases)('delta($a, $b) = $want', ({ a, b, want }) => {
    expect(headingDeltaDeg(a, b)).toBe(want);
  });
});
