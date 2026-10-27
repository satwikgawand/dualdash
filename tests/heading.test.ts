// Table-driven tests for the compass heading filter (SPEC M2-O4): circular
// smoothing across the 0/360 seam, the speed-based suppression gate, the
// hold-while-suppressed behaviour and the long-suppression re-seed.
// Degrees are never averaged naively — the seam rows prove it.

import { describe, expect, it } from 'vitest';
import { HeadingFilter, fuseHeadingDeg, headingDeltaDeg } from '../src/session/heading';
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

describe('heading: fusion priority — bearing -> derived course -> null (M2-O8)', () => {
  it('fuseHeadingDeg priority table', () => {
    // [bearing, course, fused]
    expect(fuseHeadingDeg(90, 270)).toBe(90); // bearing always wins
    expect(fuseHeadingDeg(90, null)).toBe(90);
    expect(fuseHeadingDeg(90, NaN)).toBe(90);
    expect(fuseHeadingDeg(null, 270)).toBe(270); // course stands in
    expect(fuseHeadingDeg(NaN, 270)).toBe(270);
    expect(fuseHeadingDeg(undefined, 270)).toBe(270);
    expect(fuseHeadingDeg(null, null)).toBeNull(); // nothing to show
    expect(fuseHeadingDeg(NaN, NaN)).toBeNull();
    expect(fuseHeadingDeg(null, NaN)).toBeNull();
    expect(fuseHeadingDeg(undefined, undefined)).toBeNull();
  });

  const cases: Array<{
    name: string;
    headingDeg: number | null;
    courseDeg: number | null;
    near: number | null;
  }> = [
    {
      name: 'at speed, the device bearing wins over the derived course',
      headingDeg: 90,
      courseDeg: 270,
      near: 90,
    },
    {
      name: 'at speed, a null bearing falls back to the derived course',
      headingDeg: null,
      courseDeg: 270,
      near: 270,
    },
    {
      name: 'at speed, a NaN bearing falls back to the derived course',
      headingDeg: NaN,
      courseDeg: 270,
      near: 270,
    },
    {
      name: 'bearing null and no course stays suppressed (the pre-M2-O8 bug)',
      headingDeg: null,
      courseDeg: null,
      near: null,
    },
    {
      name: 'bearing NaN and course NaN stays suppressed',
      headingDeg: NaN,
      courseDeg: NaN,
      near: null,
    },
  ];

  it.each(cases)(
    '$name',
    ({ headingDeg, courseDeg, near }) => {
      const f = new HeadingFilter();
      const out = f.push({ headingDeg, courseDeg, speedMps: SPEED, tMs: 0 });
      if (near === null) {
        expect(out).toBeNull();
        expect(f.isSuppressed()).toBe(true);
      } else {
        expect(out).not.toBeNull();
        expect(headingDeltaDeg(out!, near)).toBeLessThan(0.01);
      }
    },
  );

  it('the speed gate applies to a derived course as to a bearing', () => {
    const f = new HeadingFilter();
    expect(f.push({ headingDeg: null, courseDeg: 270, speedMps: 2.99, tMs: 0 })).toBeNull();
    expect(f.push({ headingDeg: null, courseDeg: 270, speedMps: 3, tMs: 1000 })).not.toBeNull();
  });

  it('a derived course drives the filter end-to-end (the device-null fix)', () => {
    const f = new HeadingFilter();
    // The device bearing never arrives; fixes keep flowing at driving speed.
    let out: number | null = null;
    for (let t = 0; t <= 4000; t += 1000) {
      out = f.push({ headingDeg: null, courseDeg: 90, speedMps: SPEED, tMs: t });
    }
    expect(out).not.toBeNull();
    expect(headingDeltaDeg(out!, 90)).toBeLessThan(0.01);
    expect(f.isSuppressed()).toBe(false);
    expect(f.lastSuppressionReason()).toBeNull();
  });
});

describe('heading: gate input is metres per second (M2-O8)', () => {
  // The feed is DisplayState.displaySpeedMps (core/types.ts: "Speed in metres
  // per second"); this pins the gate's m/s semantics on that contract.
  const cases: Array<{ name: string; speedMps: number; expectSuppressed: boolean }> = [
    { name: 'a 50 km/h drive (14 m/s) passes the gate', speedMps: 14, expectSuppressed: false },
    { name: 'a walking pace (1.4 m/s) is suppressed', speedMps: 1.4, expectSuppressed: true },
    { name: 'parked (0 m/s) is suppressed', speedMps: 0, expectSuppressed: true },
    { name: '3 m/s exactly passes (inclusive threshold)', speedMps: 3, expectSuppressed: false },
    { name: '2.999 m/s is suppressed', speedMps: 2.999, expectSuppressed: true },
  ];

  it.each(cases)('$name', ({ speedMps, expectSuppressed }) => {
    const f = new HeadingFilter();
    const out = f.push({ headingDeg: 90, courseDeg: null, speedMps, tMs: 0 });
    expect(out === null).toBe(expectSuppressed);
  });
});

describe('heading: suppression reason for the drive-test overlay (M2-O8)', () => {
  it('a fresh filter reports no reason until the first push', () => {
    expect(new HeadingFilter().lastSuppressionReason()).toBeNull();
  });

  it('a heading above the gate reports no reason', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: 90, speedMps: SPEED, tMs: 0 });
    expect(f.lastSuppressionReason()).toBeNull();
  });

  it('a heading below the gate reports low-speed', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: 90, speedMps: 1, tMs: 0 });
    expect(f.lastSuppressionReason()).toBe('low-speed');
  });

  it('a missing source at driving speed reports no-source', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: null, courseDeg: null, speedMps: SPEED, tMs: 0 });
    expect(f.lastSuppressionReason()).toBe('no-source');
  });

  it('a missing source below the gate reports no-source (the source is the deeper gap)', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: null, speedMps: 1, tMs: 0 });
    expect(f.lastSuppressionReason()).toBe('no-source');
  });

  it('the reason clears when a sample is accepted again', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: null, speedMps: SPEED, tMs: 0 }); // no-source
    f.push({ headingDeg: 90, speedMps: SPEED, tMs: 1000 }); // accepted
    expect(f.lastSuppressionReason()).toBeNull();
  });

  it('reset() clears the reason', () => {
    const f = new HeadingFilter();
    f.push({ headingDeg: null, speedMps: SPEED, tMs: 0 });
    f.reset();
    expect(f.lastSuppressionReason()).toBeNull();
  });
});
