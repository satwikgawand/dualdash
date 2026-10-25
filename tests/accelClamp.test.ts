import { describe, expect, it } from 'vitest';
import { clampAccel } from '../src/core/accelClamp';
import { PIPELINE } from '../src/core/types';

describe('clampAccel', () => {
  it('passes through the first sample (no previous value)', () => {
    expect(clampAccel(null, 30, 1)).toBe(30);
  });

  it('allows a change within the physical bound at 1 Hz', () => {
    // 5 m/s change over 1 s with an 8 m/s^2 bound -> allowed (budget 8).
    expect(clampAccel(10, 15, 1)).toBe(15);
  });

  it('caps an impossible positive jump to maxAccel * dt', () => {
    // 30 m/s jump in 1 s is not physical -> clamped to prev + 8.
    const out = clampAccel(5, 35, 1);
    expect(out).toBeCloseTo(5 + PIPELINE.MAX_ACCEL_MPS2, 6);
  });

  it('caps an impossible negative drop symmetrically', () => {
    const out = clampAccel(35, 0, 1);
    expect(out).toBeCloseTo(35 - PIPELINE.MAX_ACCEL_MPS2, 6);
  });

  it('bounds dt so a tunnel gap cannot widen the budget', () => {
    // dt of 30 s is clamped to CLAMP_MAX_DT_S (2 s) -> budget 16, not 240.
    const out = clampAccel(0, 200, 30);
    expect(out).toBeCloseTo(PIPELINE.MAX_ACCEL_MPS2 * PIPELINE.CLAMP_MAX_DT_S, 6);
  });
});
