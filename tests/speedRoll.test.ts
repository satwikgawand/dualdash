// Digit logic for the rolling odometer readout (SPEC M1-O8): rounding,
// splitting, leading zeros, and the reduced-motion / freeze mapping.

import { describe, expect, it } from 'vitest';
import {
  MIN_DIGIT_SLOTS,
  ROLL_DURATION_MS,
  ROLL_EASING,
  ROLL_STAGGER_MS,
  digitTransition,
  maxSettleMs,
  roundSpeed,
  speedDigitSlots,
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
