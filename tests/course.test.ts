// Derived-course fallback (SPEC M2-O8): the azimuth between the two fixes
// that are at least COURSE.MIN_DERIVE_DISPLACEMENT_M apart, fed to the
// heading filter when the device bearing is absent. Cardinal azimuts prove
// the geometry; the displacement floor and anchor tests prove jitter never
// fabricates a course while slow creep still earns one.

import { describe, expect, it } from 'vitest';
import { CourseDeriver, initialBearingDeg } from '../src/session/course';
import { COURSE } from '../src/session/constants';

/** Metres per degree of latitude (R = 6371000, same as core's haversineM). */
const M_PER_DEG_LAT = 6371000 * (Math.PI / 180);
const latOf = (metres: number) => metres / M_PER_DEG_LAT;

describe('course: initialBearingDeg (cardinal cases)', () => {
  const origin = { lat: 12.9716, lon: 77.5946 }; // ~111 m per 0.001 deg lat
  // Longitude degrees shrink with cos(lat); scaling lon by 1/cos makes the
  // diagonal cover equal metres north and east (a true 45 deg bearing).
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const cases: Array<{ name: string; to: { lat: number; lon: number }; near: number }> = [
    { name: 'due north is 0 deg', to: { lat: origin.lat + 0.001, lon: origin.lon }, near: 0 },
    { name: 'due east is 90 deg', to: { lat: origin.lat, lon: origin.lon + 0.001 }, near: 90 },
    { name: 'due south is 180 deg', to: { lat: origin.lat - 0.001, lon: origin.lon }, near: 180 },
    { name: 'due west is 270 deg', to: { lat: origin.lat, lon: origin.lon - 0.001 }, near: 270 },
    {
      name: 'a metric north-east diagonal is ~45 deg',
      to: { lat: origin.lat + 0.001, lon: origin.lon + 0.001 / cosLat },
      near: 45,
    },
    {
      name: 'a metric south-east diagonal is ~135 deg',
      to: { lat: origin.lat - 0.001, lon: origin.lon + 0.001 / cosLat },
      near: 135,
    },
  ];

  it.each(cases)('$name', ({ to, near }) => {
    const deg = initialBearingDeg(origin, to);
    const d = Math.abs(deg - near);
    expect(Math.min(d, 360 - d)).toBeLessThan(0.5);
  });
});

describe('course: CourseDeriver displacement floor (5 m)', () => {
  it('COURSE.MIN_DERIVE_DISPLACEMENT_M is the 5 m contract number', () => {
    expect(COURSE.MIN_DERIVE_DISPLACEMENT_M).toBe(5);
  });

  it('jitter below the floor never fabricates a course', () => {
    const c = new CourseDeriver();
    c.push({ lat: 12.9716, lon: 77.5946 });
    // Three ~1 m hops in different directions (inside a typical error circle).
    c.push({ lat: 12.9716 + latOf(1), lon: 77.5946 });
    c.push({ lat: 12.9716, lon: 77.5946 - latOf(1) });
    c.push({ lat: 12.9716 - latOf(1), lon: 77.5946 });
    expect(c.value()).toBeNull();
  });

  it('a fix past the floor produces the course and moves the anchor', () => {
    const c = new CourseDeriver();
    c.push({ lat: 12.9716, lon: 77.5946 });
    c.push({ lat: 12.9716 + latOf(10), lon: 77.5946 }); // 10 m due north
    expect(c.value()).not.toBeNull();
    expect(c.value()!).toBeLessThan(0.5); // north
  });

  it('slow creep accumulates against the anchor instead of being lost', () => {
    const c = new CourseDeriver();
    c.push({ lat: 12.9716, lon: 77.5946 });
    c.push({ lat: 12.9716 + latOf(2), lon: 77.5946 }); // 2 m — below floor
    expect(c.value()).toBeNull();
    c.push({ lat: 12.9716 + latOf(4), lon: 77.5946 }); // 4 m cumulative — still below
    expect(c.value()).toBeNull();
    c.push({ lat: 12.9716 + latOf(6), lon: 77.5946 }); // 6 m cumulative — course earned
    expect(c.value()!).toBeLessThan(0.5); // still due north
  });

  it('a non-finite position is ignored; the next valid fix still derives', () => {
    const c = new CourseDeriver();
    c.push({ lat: Number.NaN, lon: Number.NaN });
    expect(c.value()).toBeNull();
    c.push({ lat: 12.9716, lon: 77.5946 });
    c.push({ lat: Number.NaN, lon: 77.5946 }); // dropped, anchor unchanged
    c.push({ lat: 12.9716, lon: 77.5946 + latOf(10) / Math.cos((12.9716 * Math.PI) / 180) });
    expect(c.value()!).toBeGreaterThan(89.5); // east
    expect(c.value()!).toBeLessThan(90.5);
  });

  it('reset() clears the anchor and the course', () => {
    const c = new CourseDeriver();
    c.push({ lat: 12.9716, lon: 77.5946 });
    c.push({ lat: 12.9716 + latOf(10), lon: 77.5946 });
    expect(c.value()).not.toBeNull();
    c.reset();
    expect(c.value()).toBeNull();
  });
});
