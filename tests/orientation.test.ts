// Phone-compass seam (SPEC M2-O9): which event carries a real heading, and
// every availability state the drive-test overlay can end up in. The
// environment is injectable, so the whole state machine runs in the node
// suite against a plain EventTarget — no DOM, no hardware.

import { describe, expect, it, vi } from 'vitest';
import {
  OrientationEnvironment,
  WebOrientationSource,
  defaultOrientationEnvironment,
  orientationHeadingFromEvent,
  orientationStatusForPermission,
} from '../src/platform/orientation';
import { HeadingFilter } from '../src/session/heading';

/** A DOM event with the orientation payload attached (node has no ctor). */
function orientationEvent(
  type: string,
  payload: { alpha?: number | null; absolute?: boolean; webkitCompassHeading?: number | null },
): Event {
  return Object.assign(new Event(type), payload);
}

describe('orientation: heading extraction from an event', () => {
  it('webkitCompassHeading wins when present (WebKit reports the compass directly)', () => {
    expect(
      orientationHeadingFromEvent({ type: 'deviceorientation', webkitCompassHeading: 270 }),
    ).toBe(270);
    expect(
      orientationHeadingFromEvent({ type: 'deviceorientation', webkitCompassHeading: 360 }),
    ).toBe(0);
  });

  it('an absolute event maps alpha to the TRUE AZIMUTH — 360 − alpha (M2-O11)', () => {
    // MDN/W3C: alpha is 0° at north and rises counter-clockwise — 90° west,
    // 180° south, 270° east — so the clockwise azimuth is 360 − alpha.
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha: 90 })).toBe(270); // top west
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha: 180 })).toBe(180); // south
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha: 270 })).toBe(90); // east
    expect(orientationHeadingFromEvent({ type: 'deviceorientation', absolute: true, alpha: 0 })).toBe(0);
    // Normalised into [0, 360).
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha: 400 })).toBe(320);
  });

  it('a relative event carries no heading — it is never shown as a fake North', () => {
    expect(orientationHeadingFromEvent({ type: 'deviceorientation', alpha: 90, absolute: false })).toBeNull();
    expect(orientationHeadingFromEvent({ type: 'deviceorientation', alpha: 90 })).toBeNull();
  });

  it('non-finite payloads read as no heading', () => {
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha: NaN })).toBeNull();
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute' })).toBeNull();
    expect(
      orientationHeadingFromEvent({
        type: 'deviceorientation',
        webkitCompassHeading: NaN,
        alpha: NaN,
      }),
    ).toBeNull();
  });

  it('permission results map to honest states (never straight to active)', () => {
    expect(orientationStatusForPermission('granted')).toBe('idle');
    expect(orientationStatusForPermission('denied')).toBe('denied');
    expect(orientationStatusForPermission('prompt')).toBe('denied');
  });
});

describe('orientation: availability states of the web source (M2-O9)', () => {
  it('a platform without the API is unsupported, and never delivers a reading', async () => {
    const src = new WebOrientationSource({ api: null, target: null });
    await src.start();
    expect(src.status()).toBe('unsupported');
    src.stop();
  });

  it('the node environment itself has no window API (default env honesty)', async () => {
    const src = new WebOrientationSource(defaultOrientationEnvironment());
    await src.start();
    expect(src.status()).toBe('unsupported');
  });

  it('listening without a permission API goes idle, first absolute event goes active', async () => {
    const target = new EventTarget();
    const src = new WebOrientationSource({ api: {}, target }, () => 1000);
    const seen: Array<{ headingDeg: number; tMs: number }> = [];
    src.onReading((r) => seen.push(r));

    await src.start();
    expect(src.status()).toBe('idle');

    target.dispatchEvent(
      orientationEvent('deviceorientationabsolute', { alpha: 123, absolute: true }),
    );
    expect(src.status()).toBe('active');
    expect(seen).toEqual([{ headingDeg: 237, tMs: 1000 }]); // 360 − alpha, M2-O11

    src.stop();
    expect(src.status()).toBe('idle');
    target.dispatchEvent(orientationEvent('deviceorientationabsolute', { alpha: 10 }));
    expect(seen).toHaveLength(1); // detached
  });

  it('a relative event while listening produces no reading and no state change', async () => {
    const target = new EventTarget();
    const src = new WebOrientationSource({ api: {}, target });
    let count = 0;
    src.onReading(() => (count += 1));
    await src.start();
    target.dispatchEvent(orientationEvent('deviceorientation', { alpha: 45, absolute: false }));
    expect(count).toBe(0);
    expect(src.status()).toBe('idle');
    src.stop();
  });

  it('a granted permission request attaches and delivers', async () => {
    const target = new EventTarget();
    const src = new WebOrientationSource({
      api: { requestPermission: async () => 'granted' },
      target,
    });
    const seen: number[] = [];
    src.onReading((r) => seen.push(r.headingDeg));
    await src.start();
    expect(src.status()).toBe('idle');
    target.dispatchEvent(orientationEvent('deviceorientation', { webkitCompassHeading: 7 }));
    expect(seen).toEqual([7]);
    src.stop();
  });

  it('a denied permission request is an honest dead end (no listeners, no fake data)', async () => {
    const target = new EventTarget();
    const src = new WebOrientationSource({
      api: { requestPermission: async () => 'denied' },
      target,
    });
    let count = 0;
    src.onReading(() => (count += 1));
    await src.start();
    expect(src.status()).toBe('denied');
    target.dispatchEvent(orientationEvent('deviceorientationabsolute', { alpha: 90 }));
    expect(count).toBe(0);
  });

  it('a throwing permission request lands in denied, not in a crash', async () => {
    const target = new EventTarget();
    const src = new WebOrientationSource({
      api: {
        requestPermission: () => Promise.reject(new Error('no sensor')),
      },
      target,
    });
    await src.start();
    expect(src.status()).toBe('denied');
  });

  it('listening in silence becomes unavailable after the first-reading grace period', async () => {
    vi.useFakeTimers();
    try {
      const target = new EventTarget();
      const src = new WebOrientationSource({ api: {}, target });
      await src.start();
      expect(src.status()).toBe('idle');
      vi.advanceTimersByTime(3000); // ORIENTATION.FIRST_READ_TIMEOUT_MS
      expect(src.status()).toBe('unavailable'); // the signal for the sensors-plugin decision
      // A late sensor still revives it.
      target.dispatchEvent(orientationEvent('deviceorientationabsolute', { alpha: 3 }));
      expect(src.status()).toBe('active');
    } finally {
      vi.useRealTimers();
    }
  });

  it('start is idempotent and stop() clears the pending grace timer', async () => {
    vi.useFakeTimers();
    try {
      const target = new EventTarget();
      const src = new WebOrientationSource({ api: {}, target });
      await src.start();
      await src.start(); // second call must not double-attach
      src.stop();
      vi.advanceTimersByTime(5000);
      expect(src.status()).toBe('idle'); // timer was cleared, no flip to unavailable
    } finally {
      vi.useRealTimers();
    }
  });

  it('unsubscribe stops the delivery', async () => {
    const target = new EventTarget();
    const src = new WebOrientationSource({ api: {}, target });
    let count = 0;
    const off = src.onReading(() => (count += 1));
    await src.start();
    target.dispatchEvent(orientationEvent('deviceorientationabsolute', { alpha: 1 }));
    off();
    target.dispatchEvent(orientationEvent('deviceorientationabsolute', { alpha: 2 }));
    expect(count).toBe(1);
    src.stop();
  });
});

describe('orientation: environment wiring', () => {
  it('the injectable environment shape covers API + target independently', () => {
    const env: OrientationEnvironment = { api: {}, target: new EventTarget() };
    expect(env.api).not.toBeNull();
    expect(env.target).not.toBeNull();
  });
});

describe('orientation: true azimuth at the source (SPEC M2-O11)', () => {
  // A 90° right turn (phone flat, north -> east) as each source really
  // reports it. Sensor semantics, cited in SPEC M2-O11:
  //   - deviceorientation alpha: 0° at north, INCREASES counter-clockwise
  //     (MDN "Orientation and motion data explained"; W3C Device Orientation:
  //     "alpha is in the opposite sense to a compass heading", compass
  //     heading = 360 - alpha) -> a right turn delivers FALLING alpha.
  //   - GPS course/bearing: true azimuth, 0° = true north, CLOCKWISE
  //     (W3C Geolocation "counting clockwise relative to the true north").
  const PHONE_TURN_RIGHT = [0, 330, 300, 270]; // raw alpha off the sensor
  const GPS_TURN_RIGHT = [0, 30, 60, 90]; // same turn as a true azimuth

  /** Sensor event -> app heading, one step. */
  function orientationStep(alpha: number): number | null {
    return orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha });
  }

  it('a synthetic right turn RISES the app heading (unit proof; it FELL before the fix)', () => {
    const headings = PHONE_TURN_RIGHT.map(orientationStep);
    expect(headings).toEqual(GPS_TURN_RIGHT);
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i]!).toBeGreaterThan(headings[i - 1]!); // rises turning right
    }
  });

  it('both heading sources SIGN-AGREE through the filter on that turn', () => {
    // Same physical turn, one filter per motion state: parked follows the
    // phone compass (M2-O9), moving follows the GPS course (M2-O4/M2-O8).
    // Before M2-O11 the compass fell while the GPS course rose — the sign
    // disagreement behind "heading looks right but doesn't seem to work".
    const tail = 20; // hold the last step so both filters converge (moving TAU 1.5 s)
    const parked = new HeadingFilter();
    const moving = new HeadingFilter();
    const parkedTrace: number[] = [];
    const movingTrace: number[] = [];
    let t = 0;
    for (const alpha of [...PHONE_TURN_RIGHT, ...Array(tail).fill(270)]) {
      const out = parked.push({
        headingDeg: null,
        orientationDeg: orientationStep(alpha),
        speedMps: 0,
        tMs: t,
      });
      parkedTrace.push(out ?? Number.NaN);
      t += 500;
    }
    t = 0;
    for (const course of [...GPS_TURN_RIGHT, ...Array(tail).fill(90)]) {
      const out = moving.push({
        headingDeg: null,
        courseDeg: course,
        speedMps: 15,
        tMs: t,
      });
      movingTrace.push(out ?? Number.NaN);
      t += 500;
    }
    for (const trace of [parkedTrace, movingTrace]) {
      for (let i = 1; i < trace.length; i++) {
        expect(trace[i] - trace[i - 1]).toBeGreaterThanOrEqual(0); // never falls
      }
      expect(trace[trace.length - 1]).toBeCloseTo(90, 0); // both land on east
    }
    // Step for step: both agree in sign while the turn is in flight.
    for (let i = 1; i <= PHONE_TURN_RIGHT.length; i++) {
      const parkedD = parkedTrace[i] - parkedTrace[i - 1];
      const movingD = movingTrace[i] - movingTrace[i - 1];
      expect(Math.sign(parkedD)).toBe(Math.sign(movingD));
      expect(parkedD).toBeGreaterThan(0);
      expect(movingD).toBeGreaterThan(0);
    }
  });
});
