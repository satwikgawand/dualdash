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

  it('an absolute event reports alpha as the compass heading (Android WebView)', () => {
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha: 90 })).toBe(90);
    expect(orientationHeadingFromEvent({ type: 'deviceorientation', absolute: true, alpha: 0 })).toBe(0);
    // Normalised into [0, 360).
    expect(orientationHeadingFromEvent({ type: 'deviceorientationabsolute', alpha: 400 })).toBe(40);
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
    expect(seen).toEqual([{ headingDeg: 123, tMs: 1000 }]);

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
