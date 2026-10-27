// OrientationSource seam (SPEC M2-O9): the phone's own compass, used as the
// heading source while the car is parked. Below the GPS speed gate a course
// over the ground is meaningless, but the driver still rotates the phone —
// and the tape used to sit still (owner report: "when I move/turn my phone,
// it doesn't seem to move. It's stuck at North").
//
// Order chosen by the card, with the compatibility evidence behind it:
//   (a) the platform Web API — `deviceorientationabsolute` (Android Chrome /
//       Android WebView deliver an absolute alpha) with `webkitCompassHeading`
//       as the WebKit/iOS fallback. Alpha is converted to the app's single
//       convention — the true azimuth — inside `orientationHeadingFromEvent`
//       (SPEC M2-O11): alpha counts counter-clockwise, the azimuth clockwise.
//       Zero dependencies,
//       no plugin to keep Capacitor-8 compatible, and the app is Android-only
//       for v1 (SPEC M1-O3).
//   (b) @capacitor-community/sensors ONLY if (a) proves insufficient in the
//       Capacitor 8 WebView on the device. The escalation is observable:
//       `orientation: off` in the drive-test overlay plus suppression
//       `no-compass` means the web route delivered nothing — that is the
//       SPEC justification the card asks for before adding a dependency.
//
// Permission: iOS-style `DeviceOrientationEvent.requestPermission()` is
// called when it exists; a denial is not fatal and never fakes a reading —
// status becomes 'denied' and the tape keeps its dimmed idle. No API at all
// is 'unsupported', same honest idle.
//
// Nothing here is persisted (SPEC M1-O5); the source lives in component
// memory only.

import { ORIENTATION } from '../session/constants';

/** Compass availability for the overlay / tests (M2-O9). */
export type OrientationStatus =
  /** Listening, first reading not yet arrived (inside the grace period). */
  | 'idle'
  /** Delivering readings. */
  | 'active'
  /** Permission requested and refused. */
  | 'denied'
  /** The platform has no DeviceOrientation API at all. */
  | 'unsupported'
  /** The API exists but delivered no reading inside the grace period. */
  | 'unavailable';

export interface OrientationReading {
  /** True azimuth in degrees [0, 360): 0 = true north, rising clockwise. */
  headingDeg: number;
  /** Monotonic milliseconds (the staleness clock in useSpeed). */
  tMs: number;
}

export interface OrientationSource {
  /** Attach listeners. Safe to call twice; resolves once attached. */
  start(): Promise<void>;
  /** Detach listeners and go back to 'idle'. */
  stop(): void;
  status(): OrientationStatus;
  /** Subscribe to readings; returns the unsubscribe function. */
  onReading(cb: (r: OrientationReading) => void): () => void;
}

/**
 * The shape this module reads off a DOM orientation event — kept structural
 * so the heading maths is testable in the node suite without a DOM.
 */
export interface OrientationEventLike {
  /**
   * Z rotation in degrees. Counter-clockwise: the compass heading is
   * (360 − alpha), never alpha itself (SPEC M2-O11).
   */
  alpha?: number | null;
  /** True when alpha is in the Earth frame (a real heading). */
  absolute?: boolean;
  /** WebKit's own compass heading, degrees clockwise from north. */
  webkitCompassHeading?: number | null;
  /** Event type: only 'deviceorientationabsolute' is absolute by name. */
  type?: string;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Heading from one orientation event, or null when the event carries no
 * Earth-frame heading (SPEC M2-O9). Normalized ONCE, here, to the single
 * app convention: the true azimuth — 0° = true north, increasing CLOCKWISE
 * (SPEC M2-O11).
 *
 * Priority: `webkitCompassHeading` (WebKit reports the compass directly:
 * degrees clockwise from north, i.e. already a true azimuth), else `alpha`
 * when the event is absolute — Android WebView's `deviceorientationabsolute`
 * reports alpha as the rotation about the earth Z axis, which is NOT a
 * compass heading. The W3C Device Orientation specification says so
 * explicitly — the chosen angles mean "alpha is in the opposite sense to a
 * compass heading" — and its worked example converts it as
 * `heading = 360 - alpha` (a device flat with its top pointing west reads
 * alpha 90, heading 270). MDN states the same mapping numerically: alpha is
 * 0° at north and INCREASES COUNTER-CLOCKWISE — 90° west, 180° south,
 * 270° east. The GPS path (coords.heading / Location.getBearing / the
 * derived course) is already clockwise-from-true-north, so this one
 * conversion makes the two sources sign-agree — before it, a right turn
 * RAISED the GPS heading and FELL the compass heading (M2-O11).
 *
 * A relative event is the phone's attitude inside its own frame, NOT a
 * heading: it is dropped rather than shown as a fake North.
 */
export function orientationHeadingFromEvent(e: OrientationEventLike): number | null {
  if (
    typeof e.webkitCompassHeading === 'number' &&
    Number.isFinite(e.webkitCompassHeading)
  ) {
    return normalizeDeg(e.webkitCompassHeading);
  }
  const absolute = e.type === 'deviceorientationabsolute' || e.absolute === true;
  if (!absolute) return null;
  if (typeof e.alpha !== 'number' || !Number.isFinite(e.alpha)) return null;
  return normalizeDeg(360 - e.alpha); // counter-clockwise alpha -> true azimuth (M2-O11)
}

/** Map a permission result onto the availability state (never a fake 'active'). */
export function orientationStatusForPermission(result: string): OrientationStatus {
  return result === 'granted' ? 'idle' : 'denied';
}

/**
 * The platform bits the source needs, injectable so the node suite can drive
 * the whole state machine with a plain EventTarget (M2-O9 availability
 * states). `api` is the DeviceOrientationEvent constructor — null when the
 * platform has none (SPEC: unsupported, honest idle).
 */
export interface OrientationEnvironment {
  /** The DeviceOrientationEvent constructor (permission API when present). */
  api: { requestPermission?: () => Promise<string> } | null;
  target: EventTarget | null;
}

export function defaultOrientationEnvironment(): OrientationEnvironment {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
    return { api: null, target: null };
  }
  // Structural cast: the DOM constructor's static side carries only the
  // permission method we need (and only iOS-style builds have it at all).
  const api = DeviceOrientationEvent as unknown as OrientationEnvironment['api'];
  return { api, target: window };
}

/**
 * Web implementation: listens for absolute orientation events on the window.
 * Android WebView fires them without a permission prompt; where the platform
 * offers `requestPermission()` (iOS-style), it is called on start and a
 * refusal lands in 'denied'.
 */
export class WebOrientationSource implements OrientationSource {
  private subs = new Set<(r: OrientationReading) => void>();
  private state: OrientationStatus = 'idle';
  private handler: ((e: Event) => void) | null = null;
  private firstTimer: ReturnType<typeof setTimeout> | null = null;
  private readingSeen = false;
  private running = false;

  constructor(
    private env: OrientationEnvironment = defaultOrientationEnvironment(),
    private now: () => number = () => performance.now(),
  ) {}

  async start(): Promise<void> {
    if (this.handler !== null || this.running) return; // already listening (StrictMode re-entry)
    this.running = true;
    if (this.env.api === null || this.env.target === null) {
      this.running = false;
      this.state = 'unsupported';
      return;
    }
    const request = this.env.api.requestPermission;
    if (typeof request === 'function') {
      let result: string;
      try {
        result = await request.call(this.env.api);
      } catch {
        this.running = false;
        this.state = 'denied';
        return;
      }
      // stop() may have run while the permission prompt was open.
      if (!this.running) return;
      this.state = orientationStatusForPermission(result);
      if (this.state !== 'idle') {
        this.running = false;
        return;
      }
    }
    if (this.handler !== null) return; // a concurrent start attached first
    const target = this.env.target;
    const handler = (e: Event) => this.onEvent(e);
    target.addEventListener('deviceorientationabsolute', handler);
    target.addEventListener('deviceorientation', handler);
    this.handler = handler;
    this.state = 'idle';
    // The API can exist and still deliver nothing: the grace period is what
    // turns "listening in silence" into an observable 'unavailable' for the
    // device decision between the web route and the native sensors plugin.
    this.firstTimer = setTimeout(() => {
      this.firstTimer = null;
      if (!this.readingSeen) this.state = 'unavailable';
    }, ORIENTATION.FIRST_READ_TIMEOUT_MS);
  }

  stop(): void {
    this.running = false;
    if (this.handler !== null) {
      this.env.target?.removeEventListener('deviceorientationabsolute', this.handler);
      this.env.target?.removeEventListener('deviceorientation', this.handler);
      this.handler = null;
    }
    if (this.firstTimer !== null) {
      clearTimeout(this.firstTimer);
      this.firstTimer = null;
    }
    this.readingSeen = false;
    this.state = 'idle';
  }

  status(): OrientationStatus {
    return this.state;
  }

  onReading(cb: (r: OrientationReading) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private onEvent(e: Event): void {
    const headingDeg = orientationHeadingFromEvent(e as unknown as OrientationEventLike);
    if (headingDeg === null) return;
    this.readingSeen = true;
    if (this.firstTimer !== null) {
      clearTimeout(this.firstTimer);
      this.firstTimer = null;
    }
    if (this.state !== 'active') this.state = 'active';
    const reading: OrientationReading = { headingDeg, tMs: this.now() };
    for (const cb of this.subs) cb(reading);
  }
}
