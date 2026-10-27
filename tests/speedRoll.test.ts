// Digit logic for the rolling odometer readout (SPEC M1-O8): rounding,
// splitting, leading zeros, and the reduced-motion / freeze mapping.

import { describe, expect, it } from 'vitest';
import {
  MIN_DIGIT_SLOTS,
  ROLL_DURATION_MS,
  ROLL_EASING,
  ROLL_MAX_INDEX,
  ROLL_MIN_INDEX,
  ROLL_RECENTRE_GRACE_MS,
  ROLL_REST_BASE,
  ROLL_STAGGER_MS,
  ROLL_STRIP_CELLS,
  digitDelta,
  digitTransition,
  maxSettleMs,
  recenterRollPosition,
  rollDirection,
  rollStripCells,
  rollTransform,
  roundSpeed,
  speedDigitSlots,
  stepRollPosition,
} from '../src/components/speedRoll';

describe('roundSpeed', () => {
  it('rounds km/h the same way the static readout did', () => {
    expect(roundSpeed(5, 'kmh')).toBe(18); // 18.0
    expect(roundSpeed(7.7775, 'kmh')).toBe(28); // 27.999 -> 28
    expect(roundSpeed(27.7778, 'kmh')).toBe(100);
  });

  it('rounds mph through the same conversion', () => {
    expect(roundSpeed(10, 'mph')).toBe(22); // 22.369 -> 22
    expect(roundSpeed(44.704, 'mph')).toBe(100);
  });

  it('rounds .5 up, not down', () => {
    // 0.5 km/h exactly -> 1.8 km/h... use a value that lands on .5 after convert
    expect(roundSpeed(0.3888888888888889, 'kmh')).toBe(1); // 1.4 -> 1
    expect(roundSpeed(0.4166666666666667, 'kmh')).toBe(2); // 1.5 -> 2
  });

  it('renders a digit for zero and for defensive garbage, never NaN', () => {
    expect(roundSpeed(0, 'kmh')).toBe(0);
    expect(roundSpeed(-3, 'kmh')).toBe(0);
    expect(roundSpeed(Number.NaN, 'kmh')).toBe(0);
    expect(roundSpeed(Number.POSITIVE_INFINITY, 'mph')).toBe(0);
  });
});

describe('speedDigitSlots', () => {
  it('pads to the odometer field width with leading zeros', () => {
    expect(speedDigitSlots(0, 'kmh')).toEqual([0, 0, 0]);
    expect(speedDigitSlots(5, 'kmh')).toEqual([0, 1, 8]); // 18 km/h
    expect(speedDigitSlots(27.7778, 'kmh')).toEqual([1, 0, 0]);
  });

  it('keeps three columns across the digit-boundary crossings', () => {
    // 9 -> 10 -> 99 -> 100 must all render in the same 3-slot field.
    expect(speedDigitSlots(9 / 3.6, 'kmh')).toEqual([0, 0, 9]);
    expect(speedDigitSlots(10 / 3.6, 'kmh')).toEqual([0, 1, 0]);
    expect(speedDigitSlots(99 / 3.6, 'kmh')).toEqual([0, 9, 9]);
    expect(speedDigitSlots(100 / 3.6, 'kmh')).toEqual([1, 0, 0]);
  });

  it('splits multi-digit values right-to-left', () => {
    expect(speedDigitSlots(83.3333, 'kmh')).toEqual([3, 0, 0]); // 300 km/h
    expect(speedDigitSlots(22.352, 'mph')).toEqual([0, 5, 0]); // 50 mph
  });

  it('grows the field past 999 instead of truncating (honest data)', () => {
    expect(speedDigitSlots(280, 'kmh')).toEqual([1, 0, 0, 8]); // 1008 km/h
  });

  it('honours an explicit minimum slot count', () => {
    expect(speedDigitSlots(5, 'kmh', 5)).toEqual([0, 0, 0, 1, 8]);
    expect(MIN_DIGIT_SLOTS).toBe(3);
  });

  it('one digit per slot, all digits valid', () => {
    const digits = speedDigitSlots(59.7, 'kmh'); // 215 km/h
    expect(digits).toHaveLength(3);
    for (const d of digits) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(9);
    }
    // Reassembling the slots reproduces the rounded speed.
    expect(Number(digits.join(''))).toBe(215);
  });
});

describe('digitTransition (reduced motion + freeze mapping)', () => {
  const rolling = { reducedMotion: false, animate: true };

  it('maps reduced motion to an instant swap', () => {
    expect(digitTransition(0, { reducedMotion: true, animate: true })).toBe('none');
    expect(digitTransition(2, { reducedMotion: true, animate: true })).toBe('none');
  });

  it('maps a frozen (STALE/LOST) hold to an instant swap', () => {
    expect(digitTransition(0, { reducedMotion: false, animate: false })).toBe('none');
  });

  it('rolls with the SPEC duration and easing, no bounce', () => {
    expect(digitTransition(0, rolling)).toBe(
      `transform ${ROLL_DURATION_MS}ms ${ROLL_EASING} 0ms`,
    );
    expect(ROLL_DURATION_MS).toBeGreaterThanOrEqual(250);
    expect(ROLL_DURATION_MS).toBeLessThanOrEqual(400);
  });

  it('staggers columns left to right', () => {
    expect(digitTransition(1, rolling)).toContain(` ${ROLL_STAGGER_MS}ms`);
    expect(digitTransition(2, rolling)).toContain(` ${ROLL_STAGGER_MS * 2}ms`);
  });

  it('settles before the next 1 Hz sample, field included', () => {
    expect(maxSettleMs(MIN_DIGIT_SLOTS)).toBeLessThan(1000);
    expect(maxSettleMs(4)).toBeLessThan(1000);
    expect(maxSettleMs(1)).toBe(ROLL_DURATION_MS);
  });
});

describe('rollDirection (SPEC M2-O5: the strip follows the speed change)', () => {
  it('rolls up while accelerating and down while decelerating', () => {
    expect(rollDirection(16.3, 16.7)).toBe('up'); // 59 -> 60 km/h
    expect(rollDirection(16.9, 16.7)).toBe('down'); // 61 -> 60 km/h
  });

  it('is neutral when nothing moves (first paint, held speed)', () => {
    expect(rollDirection(null, 20)).toBe('neutral'); // first paint: no spin
    expect(rollDirection(20, 20)).toBe('neutral');
  });

  it('is neutral for defensive garbage instead of guessing', () => {
    expect(rollDirection(Number.NaN, 20)).toBe('neutral');
    expect(rollDirection(20, Number.POSITIVE_INFINITY)).toBe('neutral');
  });
});

describe('digitDelta (direction-aware travel through the 9 <-> 0 seam)', () => {
  it('accelerating 9 -> 0 climbs ONE cell (the owner-reported case)', () => {
    expect(digitDelta(9, 0, 'up')).toBe(1);
  });

  it('decelerating 1 -> 0 and 0 -> 9 descend through the seam', () => {
    expect(digitDelta(1, 0, 'down')).toBe(-1);
    expect(digitDelta(0, 9, 'down')).toBe(-1);
  });

  it('accelerating 0 -> 9 climbs the long way, never backwards', () => {
    expect(digitDelta(0, 9, 'up')).toBe(9);
  });

  it('an unchanged digit does not move', () => {
    expect(digitDelta(7, 7, 'up')).toBe(0);
    expect(digitDelta(7, 7, 'down')).toBe(0);
  });

  it('neutral takes the shortest path, ties climb', () => {
    expect(digitDelta(0, 9, 'neutral')).toBe(-1);
    expect(digitDelta(9, 0, 'neutral')).toBe(1);
    expect(digitDelta(0, 4, 'neutral')).toBe(4);
    expect(digitDelta(0, 6, 'neutral')).toBe(-4);
    expect(digitDelta(0, 5, 'neutral')).toBe(5);
  });
});

describe('roll positions (strip stepping, wraps, recentre)', () => {
  const cells = rollStripCells();

  it('draws three copies of 0-9 plus the closing 0', () => {
    expect(ROLL_STRIP_CELLS).toBe(31);
    expect(cells).toHaveLength(31);
    expect(cells.slice(0, 11)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
    expect(cells[ROLL_MIN_INDEX]).toBe(0);
    expect(cells[ROLL_MAX_INDEX]).toBe(9);
    expect(rollTransform(13)).toBe('translateY(-13em)');
  });

  it('59 -> 60 accelerating: every strip climbs, the ones digit wraps UP', () => {
    const from = speedDigitSlots(59 / 3.6, 'kmh'); // [0, 5, 9]
    const to = speedDigitSlots(60 / 3.6, 'kmh'); // [0, 6, 0]
    const dir = rollDirection(59 / 3.6, 60 / 3.6);
    let pos = from.map((d) => ROLL_REST_BASE + d);
    pos = pos.map((p, i) => stepRollPosition(p, to[i], dir));
    expect(from).toEqual([0, 5, 9]);
    expect(to).toEqual([0, 6, 0]);
    // Accelerating: no strip descends (each one climbs or holds)...
    expect(pos.every((p, i) => p >= ROLL_REST_BASE + from[i])).toBe(true);
    // ...and the ones strip climbs exactly one cell through the seam.
    expect(pos[2] - (ROLL_REST_BASE + 9)).toBe(1);
    expect(pos.map((p) => cells[p % 10])).toEqual(to);
    expect(recenterRollPosition(pos[2])).toBe(ROLL_REST_BASE);
  });

  it('61 -> 60 decelerating: the ones strip descends through the seam', () => {
    const from = speedDigitSlots(61 / 3.6, 'kmh'); // [0, 6, 1]
    const to = speedDigitSlots(60 / 3.6, 'kmh'); // [0, 6, 0]
    const dir = rollDirection(61 / 3.6, 60 / 3.6);
    const start = from.map((d) => ROLL_REST_BASE + d);
    const pos = start.map((p, i) => stepRollPosition(p, to[i], dir));
    expect(pos).toEqual([ROLL_REST_BASE, ROLL_REST_BASE + 6, ROLL_REST_BASE]);
    expect(pos.map((p) => cells[p % 10])).toEqual(to);
  });

  it('jumps of any size roll in the travel direction only', () => {
    // 12 -> 99 km/h accelerating: both strips climb.
    const upFrom = speedDigitSlots(12 / 3.6, 'kmh'); // [0, 1, 2]
    const upTo = speedDigitSlots(99 / 3.6, 'kmh'); // [0, 9, 9]
    const up = rollDirection(12 / 3.6, 99 / 3.6);
    expect(up).toBe('up');
    const upPos = upFrom.map((d, i) =>
      stepRollPosition(ROLL_REST_BASE + d, upTo[i], up),
    );
    expect(upPos[1]).toBe(ROLL_REST_BASE + 9); // 1 -> 9 climbs 8 cells
    expect(upPos[2]).toBe(ROLL_REST_BASE + 9); // 2 -> 9 climbs 7 cells
    expect(upPos.map((p) => cells[p % 10])).toEqual(upTo);

    // 99 -> 12 km/h decelerating: both strips descend.
    const down = rollDirection(99 / 3.6, 12 / 3.6);
    expect(down).toBe('down');
    const downPos = [ROLL_REST_BASE + 0, ROLL_REST_BASE + 9, ROLL_REST_BASE + 9].map(
      (p, i) => stepRollPosition(p, upFrom[i], down),
    );
    expect(downPos).toEqual([ROLL_REST_BASE, ROLL_REST_BASE + 1, ROLL_REST_BASE + 2]);
    expect(downPos.map((p) => cells[p % 10])).toEqual(upFrom);
  });

  it('a unit toggle takes the shortest path, then direction resumes', () => {
    const mps = 100 / 3.6; // 100 km/h == 62 mph
    // The toggle redraws the field with no speed change: neutral, no spin.
    expect(rollDirection(mps, mps)).toBe('neutral');
    const kmh = speedDigitSlots(mps, 'kmh'); // [1, 0, 0]
    const mph = speedDigitSlots(mps, 'mph'); // [0, 2, 6]
    const dir = rollDirection(mps, mps);
    const toggled = kmh.map((d, i) => stepRollPosition(ROLL_REST_BASE + d, mph[i], dir));
    expect(toggled.map((p) => cells[p % 10])).toEqual(mph);
    for (let i = 1; i < toggled.length; i++) {
      expect(Math.abs(toggled[i] - (ROLL_REST_BASE + kmh[i]))).toBeLessThanOrEqual(5);
    }
    // Accelerating after the toggle rolls up in the new unit again.
    expect(rollDirection(mps, mps + 0.5)).toBe('up');
  });

  it('recentres into the middle copy without changing the digit', () => {
    for (let p = 0; p < ROLL_STRIP_CELLS; p++) {
      const r = recenterRollPosition(p);
      expect(r).toBeGreaterThanOrEqual(ROLL_MIN_INDEX);
      expect(r).toBeLessThanOrEqual(ROLL_MAX_INDEX);
      expect(r % 10).toBe(p % 10);
    }
  });

  it('never walks off the strip: a 200-step drive stays in range and honest', () => {
    let mps = 0;
    let pos = ROLL_REST_BASE; // ones digit at 0
    for (let step = 0; step < 200; step++) {
      const next = mps + (step % 2 === 0 ? 0.4 : -0.15); // up, up, down, ...
      const dir = rollDirection(mps, next);
      const digit = speedDigitSlots(next, 'kmh')[2];
      pos = recenterRollPosition(stepRollPosition(pos, digit, dir));
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(ROLL_STRIP_CELLS);
      expect(cells[pos]).toBe(digit);
      mps = next;
    }
  });

  it('the recentre fires after the roll settles and stays inside the 1 Hz tick', () => {
    expect(ROLL_DURATION_MS + MIN_DIGIT_SLOTS * ROLL_STAGGER_MS + ROLL_RECENTRE_GRACE_MS).toBeLessThan(
      1000,
    );
  });
});
