// Table-driven tests for the M2 threshold alert (SPEC M2-O3): crossing
// fires, the 15 s re-fire cadence, the ~1 km/h hysteresis (no buzz-dance),
// clear/set behaviour, and the quick-stepper arithmetic.

import { describe, expect, it } from 'vitest';
import { ThresholdMonitor, stepThreshold } from '../src/session/threshold';
import { ALERT } from '../src/session/constants';

const kmh = (k: number) => k / 3.6;

describe('threshold: crossing fires once, then obeys the 15 s cadence', () => {
  const cases: Array<{
    name: string;
    limitKmh: number | null;
    /** [speed km/h, time ms] samples fed in order. */
    samples: Array<[number, number]>;
    expectFiresAt: number[]; // times of the samples that must fire
  }> = [
    {
      name: 'no limit set: never fires',
      limitKmh: null,
      samples: [
        [120, 0],
        [150, 1000],
      ],
      expectFiresAt: [],
    },
    {
      name: 'below the line never fires',
      limitKmh: 90,
      samples: [
        [80, 0],
        [89, 5000],
        [89.9, 10_000],
      ],
      expectFiresAt: [],
    },
    {
      name: 'crossing above fires exactly once',
      limitKmh: 90,
      samples: [
        [80, 0],
        [91, 1000],
        [95, 2000],
        [99, 3000],
      ],
      expectFiresAt: [1000],
    },
    {
      name: 'still over: no re-fire inside 15 s, one at 15 s',
      limitKmh: 90,
      samples: [
        [91, 1000], // first fire
        [99, 14_000], // 13 s after -> silent
        [99, 15_999], // 14.999 s -> silent
        [99, 16_000], // exactly 15 s -> fires
        [99, 31_000], // exactly 15 s later -> fires
      ],
      expectFiresAt: [1000, 16_000, 31_000],
    },
    {
      name: 'drop below (inside hysteresis) then re-cross: no buzz-dance',
      limitKmh: 90,
      samples: [
        [91, 1000], // fire
        [89.5, 5000], // 0.5 km/h below -> latched, no re-arm
        [91, 6000], // re-cross -> silent (still latched)
        [99, 7000], // still silent
      ],
      expectFiresAt: [1000],
    },
    {
      name: 'fall a full hysteresis band below, re-cross: fires again (cadence respected)',
      limitKmh: 90,
      samples: [
        [91, 1000], // fire
        [88.9, 5000], // 1.1 km/h below -> re-armed
        [91, 6000], // re-cross still inside the 15 s cadence -> silent
        [91, 16_000], // 15 s after the last buzz -> fires
      ],
      expectFiresAt: [1000, 16_000],
    },
    {
      name: 'exactly 1 km/h below is still latched (hysteresis is strict)',
      limitKmh: 90,
      samples: [
        [91, 1000], // fire
        [89, 5000], // exactly 1.0 below -> latched
        [91, 6000], // silent
      ],
      expectFiresAt: [1000],
    },
  ];

  it.each(cases)('$name', ({ limitKmh, samples, expectFiresAt }) => {
    const m = new ThresholdMonitor();
    m.setLimit(limitKmh);
    const firedAt: number[] = [];
    for (const [speedKmh, t] of samples) {
      if (m.push(kmh(speedKmh), t)) firedAt.push(t);
    }
    expect(firedAt).toEqual(expectFiresAt);
  });
});

describe('threshold: limit set / clear semantics', () => {
  it('clearing the limit silences the alert immediately', () => {
    const m = new ThresholdMonitor();
    m.setLimit(90);
    expect(m.push(kmh(120), 0)).toBe(true);
    m.setLimit(null);
    expect(m.limit()).toBeNull();
    expect(m.push(kmh(150), 1000)).toBe(false);
    expect(m.isOver()).toBe(false);
  });

  it('setting a new limit re-arms: the next crossing fires (after the 15 s cadence)', () => {
    const m = new ThresholdMonitor();
    m.setLimit(90);
    expect(m.push(kmh(120), 0)).toBe(true); // fire (latched now)
    m.setLimit(130); // raised past the current speed
    expect(m.isOver()).toBe(false);
    // The buzz cadence is global: a new limit cannot spam through it.
    expect(m.push(kmh(131), 1000)).toBe(false);
    expect(m.push(kmh(131), 15_001)).toBe(true); // 15 s since the last buzz
  });

  it('isOver() reports the line honestly, also inside the hysteresis band', () => {
    const m = new ThresholdMonitor();
    m.setLimit(90);
    m.push(kmh(95), 0);
    expect(m.isOver()).toBe(true);
    m.push(kmh(89.5), 1000); // inside the band: not over, still latched
    expect(m.isOver()).toBe(false);
    m.push(kmh(91), 2000); // latched -> over again, no buzz
    expect(m.isOver()).toBe(true);
    expect(m.push(kmh(91), 2001)).toBe(false);
  });

  it('suspend() hides "over" while the feed is frozen; live data resumes cleanly', () => {
    const m = new ThresholdMonitor();
    m.setLimit(90);
    expect(m.push(kmh(95), 0)).toBe(true); // live crossing fires
    m.suspend(); // STALE/LOST: held value must not report or buzz
    expect(m.isOver()).toBe(false);
    // Live again inside the cadence window: over, but silent.
    expect(m.push(kmh(120), 1000)).toBe(false);
    expect(m.isOver()).toBe(true);
    m.suspend();
    // Past the 15 s cadence with live data: fires again.
    expect(m.push(kmh(120), 15_001)).toBe(true);
  });

  it('the floor keeps a nonsense low limit from arming', () => {
    const m = new ThresholdMonitor();
    m.setLimit(1);
    expect(m.limit()).toBe(ALERT.MIN_LIMIT_KMH);
  });
});

describe('threshold: quick-stepper arithmetic', () => {
  const cases: Array<{
    name: string;
    limitKmh: number | null;
    currentMps: number;
    deltaKmh: number;
    expect: number;
  }> = [
    {
      name: '+5 off the current speed snaps to the 5 km/h grid (84.3 -> 90)',
      limitKmh: null,
      currentMps: kmh(84.3),
      deltaKmh: 5,
      expect: 90,
    },
    {
      name: '+10 off the current speed (84.3 -> 95)',
      limitKmh: null,
      currentMps: kmh(84.3),
      deltaKmh: 10,
      expect: 95,
    },
    {
      name: '-5 off the current speed (84.3 -> 80)',
      limitKmh: null,
      currentMps: kmh(84.3),
      deltaKmh: -5,
      expect: 80,
    },
    {
      name: 'stepping an existing limit moves it by the delta',
      limitKmh: 90,
      currentMps: kmh(84.3),
      deltaKmh: 5,
      expect: 95,
    },
    {
      name: 'big step down an existing limit',
      limitKmh: 90,
      currentMps: kmh(95),
      deltaKmh: -10,
      expect: 80,
    },
    {
      name: 'the limit never drops below the floor',
      limitKmh: 5,
      currentMps: kmh(4),
      deltaKmh: -10,
      expect: ALERT.MIN_LIMIT_KMH,
    },
    {
      name: 'first tap at crawling speed still lands on the floor',
      limitKmh: null,
      currentMps: kmh(2),
      deltaKmh: -10,
      expect: ALERT.MIN_LIMIT_KMH,
    },
  ];

  it.each(cases)('$name', ({ limitKmh, currentMps, deltaKmh, expect: want }) => {
    expect(stepThreshold(limitKmh, currentMps, deltaKmh)).toBe(want);
  });
});
