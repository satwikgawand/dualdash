import { describe, expect, it } from 'vitest';
import {
  MPS_TO_KMH,
  MPS_TO_MPH,
  compassLabel,
  convert,
  mpsToKmh,
  mpsToMph,
  unitLabel,
} from '../src/core/units';

describe('unit conversion', () => {
  it('converts m/s to km/h (x3.6)', () => {
    expect(mpsToKmh(10)).toBeCloseTo(36, 6);
    expect(MPS_TO_KMH).toBe(3.6);
  });

  it('converts m/s to mph (x2.236936)', () => {
    expect(mpsToMph(10)).toBeCloseTo(22.36936, 5);
    expect(MPS_TO_MPH).toBeCloseTo(2.2369362920544, 12);
  });

  it('a known value: 100 km/h ~= 62.14 mph', () => {
    const kmh = mpsToKmh(27.7778);
    const mph = mpsToMph(27.7778);
    expect(Math.round(kmh)).toBe(100);
    expect(Math.round(mph * 10) / 10).toBeCloseTo(62.1, 1);
  });

  it('convert() dispatches by unit', () => {
    expect(convert(10, 'kmh')).toBeCloseTo(36, 6);
    expect(convert(10, 'mph')).toBeCloseTo(22.36936, 5);
  });

  it('unit labels', () => {
    expect(unitLabel('kmh')).toBe('km/h');
    expect(unitLabel('mph')).toBe('mph');
  });

  it('compass labels from degrees', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(90)).toBe('E');
    expect(compassLabel(180)).toBe('S');
    expect(compassLabel(270)).toBe('W');
    expect(compassLabel(45)).toBe('NE');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(null)).toBe('');
    expect(compassLabel(Number.NaN)).toBe('');
  });
});
