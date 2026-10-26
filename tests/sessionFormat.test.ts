// Table-driven tests for the session display formatters (SPEC M2-O1):
// elapsed clock strings and unit-aware distance. The distance rows guard the
// bug the drive test caught early: distance must convert metres -> km/mi,
// never through the m/s -> km/h speed converter (which inflates 400 m to
// "1440.0 km").

import { describe, expect, it } from 'vitest';
import { formatDistance, formatElapsed } from '../src/session/format';

describe('formatElapsed', () => {
  const cases: Array<{ ms: number; want: string }> = [
    { ms: 0, want: '00:00' },
    { ms: 999, want: '00:00' },
    { ms: 1000, want: '00:01' },
    { ms: 59_000, want: '00:59' },
    { ms: 60_000, want: '01:00' },
    { ms: 599_000, want: '09:59' },
    { ms: 600_000, want: '10:00' },
    { ms: 3_599_000, want: '59:59' },
    { ms: 3_600_000, want: '1:00:00' },
    { ms: 3_661_000, want: '1:01:01' },
    { ms: 72_000_000, want: '20:00:00' },
    { ms: -5, want: '00:00' },
  ];

  it.each(cases)('formatElapsed($ms) = $want', ({ ms, want }) => {
    expect(formatElapsed(ms)).toBe(want);
  });
});

describe('formatDistance', () => {
  const cases: Array<{ m: number; unit: 'kmh' | 'mph'; want: string }> = [
    { m: 0, unit: 'kmh', want: '0.0 km' },
    { m: 100, unit: 'kmh', want: '0.1 km' },
    { m: 435.9, unit: 'kmh', want: '0.4 km' },
    { m: 1000, unit: 'kmh', want: '1.0 km' },
    { m: 12_430, unit: 'kmh', want: '12.4 km' },
    { m: 0, unit: 'mph', want: '0.0 mi' },
    { m: 1609.344, unit: 'mph', want: '1.0 mi' },
    { m: 12_345, unit: 'mph', want: '7.7 mi' },
    { m: -10, unit: 'kmh', want: '0.0 km' },
    { m: NaN, unit: 'kmh', want: '0.0 km' },
  ];

  it.each(cases)('formatDistance($m m, $unit) = $want', ({ m, unit, want }) => {
    expect(formatDistance(m, unit)).toBe(want);
  });

  it('never routes distance through the speed converter (the 400 m trap)', () => {
    // 400 m is 0.4 km — not 1440 "km" from metres*3.6.
    expect(formatDistance(400, 'kmh')).toBe('0.4 km');
  });
});
