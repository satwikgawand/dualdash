// useSpeed: the single data layer both Drive and HUD modes render from.
// Wires SpeedSource -> SpeedProcessor -> React state, with a rAF tick so
// staleness progresses even when fixes stop arriving (tunnel). Also owns
// keep-awake while the app shows realtime data. Nothing is persisted: the
// view model lives in component memory only (SPEC M1-O5, realtime-only).
//
// M2 (SPEC M2-O1..O4) rides the same feed: every fix goes to the session
// machine (distance / pause / suggestion evidence), every frame to the
// threshold monitor (over-speed line + buzz cadence) and the heading
// filter (compass). All three are pure, RAM-only objects held in refs; the
// hook mirrors them into React state and exposes the driver actions.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SpeedProcessor } from '../core/pipeline';
import { DisplayState, RawFix } from '../core/types';
import { Unit } from '../core/units';
import { Buzz } from '../platform/Buzz';
import { ScreenLock } from '../platform/ScreenLock';
import { SourceDiagnostics, SpeedSource } from '../platform/SpeedSource';
import { OrientationSource } from '../platform/orientation';
import { CourseDeriver } from '../session/course';
import { HeadingFilter, HeadingSource, HeadingSuppression } from '../session/heading';
import { SessionMachine, SessionSnapshot } from '../session/sessionMachine';
import { ThresholdMonitor, stepThreshold } from '../session/threshold';
import { ORIENTATION } from '../session/constants';
import { ChipView, chipFor } from './locationChip';

export type DriveMode = 'drive' | 'hud';

/** Debug instrumentation shape (SPEC O4 drive-test overlay). */
export interface VmDebug {
  rawSpeedMps: number | null;
  fixCount: number;
  lastIntervalMs: number | null;
}

/** Everything M2 shows (session, over-speed line, compass). RAM-only. */
export interface M2State {
  session: SessionSnapshot;
  /** Over-speed line in km/h, or null when none is set. */
  alertLimitKmh: number | null;
  alertOver: boolean;
  /** Smoothed heading in degrees (held while suppressed). */
  headingDeg: number | null;
  headingSuppressed: boolean;
  /**
   * Heading-chain instrumentation (SPEC M2-O8, drive-test overlay):
   * raw device bearing (null when the fix carried none), the course derived
   * from position deltas (null before 5 m of travel), why the heading is
   * suppressed, and the exact m/s value that feeds the heading gate.
   */
  rawHeadingDeg: number | null;
  derivedCourseDeg: number | null;
  headingSuppression: HeadingSuppression;
  gateSpeedMps: number;
  /**
   * Phone-compass reading (SPEC M2-O9): the last fresh orientation value,
   * or null when the source is off / denied / stale — the overlay's
   * `orientation: <deg> deg | off` line. Never a placeholder heading.
   */
  orientationDeg: number | null;
  /** Which source the tape follows (M2-O9): 'course' | 'bearing' | 'orientation' | null. */
  headingSource: HeadingSource;
  /** Bumped once per alert tick; drives the screen-edge flash. */
  flashKey: number;
}

/** Driver actions for the M2 surfaces. */
export interface M2Actions {
  startSession: () => void;
  stopSession: () => void;
  resumeSession: () => void;
  dismissSummary: () => void;
  acceptSuggestion: () => void;
  dismissSuggestion: () => void;
  /** Delta in km/h (+/-5, +/-10); bases on the current speed when no line. */
  stepLimit: (deltaKmh: number) => void;
  clearLimit: () => void;
}

export interface SpeedViewModel {
  state: DisplayState;
  unit: Unit;
  setUnit: (u: Unit) => void;
  mode: DriveMode;
  setMode: (m: DriveMode) => void;
  error: string | null;
  /** Debug instrumentation (SPEC O4): last raw speed, accepted-fix count, fix interval. */
  debug: VmDebug;
  /** Chain health (SPEC M1-O7): permission, provider, watch, last error. */
  location: SourceDiagnostics;
  /** The one chip this state shows in the fix-age area (M1-O7). */
  chip: ChipView;
  /** Runs the permission request / chain re-check behind the chip's button. */
  allowLocation: () => void;
  /** M2 view state (session stats, over-speed line, compass). */
  m2: M2State;
  /** M2 driver actions (start/stop/resume, suggestion taps, stepper). */
  m2Actions: M2Actions;
}

const NS_PER_MS = 1_000_000;

export function useSpeed(
  source: SpeedSource,
  screenLock: ScreenLock,
  buzz: Buzz,
  orientation: OrientationSource,
  opts?: { unit?: Unit; mode?: DriveMode },
): SpeedViewModel {
  const processorRef = useRef(new SpeedProcessor());
  const anchorRef = useRef<number>(0); // performance.now() anchor for monotonic ns
  const lastFixNsRef = useRef<bigint | null>(null);
  const rawSpeedRef = useRef<number | null>(null);
  const fixCountRef = useRef(0);
  const lastIntervalRef = useRef<number | null>(null);

  // M2 pure state machines (SPEC M2-O1..O4). Refs: they outlive renders and
  // carry the whole process-lifetime nag guard.
  const sessionRef = useRef(new SessionMachine());
  const thresholdRef = useRef(new ThresholdMonitor());
  const headingRef = useRef(new HeadingFilter());
  const courseRef = useRef(new CourseDeriver());
  const rawHeadingRef = useRef<number | null>(null); // last device bearing (M2-O8)
  // Last phone-compass reading (M2-O9): value + stamp on the feedFrame clock,
  // so staleness is judged against the same performance.now() timeline.
  const orientationDegRef = useRef<number | null>(null);
  const orientationMsRef = useRef<number | null>(null);
  const flashRef = useRef(0);
  const latestSpeedRef = useRef(0);

  const [state, setState] = useState<DisplayState>(() =>
    processorRef.current.getSnapshot(0n),
  );
  const [unit, setUnit] = useState<Unit>(opts?.unit ?? 'kmh');
  const [mode, setMode] = useState<DriveMode>(opts?.mode ?? 'drive');
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<SourceDiagnostics>(() =>
    source.diagnostics(),
  );
  const [debug, setDebug] = useState<VmDebug>({
    rawSpeedMps: null,
    fixCount: 0,
    lastIntervalMs: null,
  });
  const [m2, setM2] = useState<M2State>(() => ({
    session: sessionRef.current.snapshot(performance.now()),
    alertLimitKmh: thresholdRef.current.limit(),
    alertOver: thresholdRef.current.isOver(),
    headingDeg: headingRef.current.value(),
    headingSuppressed: headingRef.current.isSuppressed(),
    rawHeadingDeg: null,
    derivedCourseDeg: null,
    headingSuppression: null,
    gateSpeedMps: 0,
    orientationDeg: null,
    headingSource: null,
    flashKey: 0,
  }));

  /**
   * The compass reading that counts right now (SPEC M2-O9): null before the
   * first reading and once the source goes quiet, so a sensor that dies
   * mid-session falls back to the dimmed idle instead of holding a heading.
   */
  const freshOrientation = useCallback((tMs: number): number | null => {
    const at = orientationMsRef.current;
    if (at === null || tMs - at > ORIENTATION.STALE_AFTER_MS) return null;
    return orientationDegRef.current;
  }, []);

  /** Mirror the pure M2 machines into React state. */
  const syncM2 = useCallback((tMs: number): M2State => {
    const next: M2State = {
      session: sessionRef.current.snapshot(tMs),
      alertLimitKmh: thresholdRef.current.limit(),
      alertOver: thresholdRef.current.isOver(),
      headingDeg: headingRef.current.value(),
      headingSuppressed: headingRef.current.isSuppressed(),
      rawHeadingDeg: rawHeadingRef.current,
      derivedCourseDeg: courseRef.current.value(),
      headingSuppression: headingRef.current.lastSuppressionReason(),
      // latestSpeedRef is set to exactly the displaySpeedMps that the next
      // feedFrame pushes into the heading gate, so the overlay reads the
      // real gate input (SPEC M2-O8).
      gateSpeedMps: latestSpeedRef.current,
      orientationDeg: freshOrientation(tMs),
      headingSource: headingRef.current.lastSource(),
      flashKey: flashRef.current,
    };
    setM2(next);
    return next;
  }, [freshOrientation]);

  // Chain health (permission / provider / watch / last error) is pushed by the
  // source; the chip and the overlay read it (SPEC M1-O7).
  useEffect(() => source.onDiagnostics(setLocation), [source]);

  // Phone compass (SPEC M2-O9): the heading source while parked. Readings
  // land in refs only — RAM, like everything else (M1-O5) — and feedFrame
  // drops them after ORIENTATION.STALE_AFTER_MS so a dead sensor dims the
  // tape instead of holding a stale heading.
  useEffect(() => {
    let mounted = true;
    const off = orientation.onReading((r) => {
      if (!mounted) return;
      orientationDegRef.current = r.headingDeg;
      orientationMsRef.current = r.tMs;
    });
    orientation.start().catch(() => {
      // Permission/API failures are not fatal: status stays honest, the tape
      // keeps its dimmed idle (never a fake heading).
    });
    return () => {
      mounted = false;
      off();
      orientation.stop();
      orientationDegRef.current = null;
      orientationMsRef.current = null;
    };
  }, [orientation]);

  const allowLocation = useCallback(() => {
    void source.requestPermission();
  }, [source]);

  const nowNs = useCallback((): bigint => {
    return BigInt(Math.round(performance.now() * NS_PER_MS));
  }, []);

  // Handle one raw fix: feed processor + session machine, refresh state.
  const handleFix = useCallback(
    (fix: RawFix) => {
      const proc = processorRef.current;
      proc.pushFix(fix);

      rawSpeedRef.current = fix.hasSpeed ? fix.speedMps : null;
      rawHeadingRef.current = Number.isFinite(fix.headingDeg) ? fix.headingDeg : null;
      courseRef.current.push({ lat: fix.lat, lon: fix.lon });
      fixCountRef.current += 1;
      if (lastFixNsRef.current !== null) {
        lastIntervalRef.current = Number(fix.elapsedRealtimeNanos - lastFixNsRef.current) / 1e9 * 1000;
      }
      lastFixNsRef.current = fix.elapsedRealtimeNanos;

      const tMs = performance.now();
      const snap = proc.getSnapshot(nowNs());
      // Session evidence needs real fixes: distance is fix-to-fix (M2-O1).
      sessionRef.current.onFix({
        tMs,
        speedMps: snap.displaySpeedMps,
        lat: fix.lat,
        lon: fix.lon,
      });
      latestSpeedRef.current = snap.displaySpeedMps;

      setState(snap);
      setDebug({
        rawSpeedMps: rawSpeedRef.current,
        fixCount: fixCountRef.current,
        lastIntervalMs: lastIntervalRef.current,
      });
      syncM2(tMs);
    },
    [nowNs, syncM2],
  );

  // M2 per-frame feed: suggestion timers, over-speed line, compass filter.
  // An alert tick fires the haptic and bumps the edge flash (SPEC M2-O3).
  const feedFrame = useCallback(
    (snap: DisplayState, tMs: number) => {
      sessionRef.current.tick(tMs);
      latestSpeedRef.current = snap.displaySpeedMps;
      // A frozen hold (STALE/LOST) never fires and never shows "over":
      // the alert only speaks about real measurements (SPEC M2-O3).
      const fired =
        snap.confidence === 'frozen'
          ? (thresholdRef.current.suspend(), false)
          : thresholdRef.current.push(snap.displaySpeedMps, tMs);
      if (fired) {
        flashRef.current += 1;
        buzz.alert();
      }
      headingRef.current.push({
        headingDeg: snap.headingDeg,
        // M2-O8: the derived course stands in when the device bearing is
        // absent; M2-O9 adds the phone compass (below the gate it is the
        // only source, at speed it is third in line). Fusion priority lives
        // in fuseHeadingDeg / HeadingFilter.push.
        courseDeg: courseRef.current.value(),
        orientationDeg: freshOrientation(tMs),
        speedMps: snap.displaySpeedMps,
        tMs,
      });
      syncM2(tMs);
    },
    [buzz, syncM2, freshOrientation],
  );

  // Start the source + a staleness tick. The tick runs while mounted so
  // STALE/LOST transition even with no incoming fixes (gps-speed.md section 5).
  useEffect(() => {
    let mounted = true;
    let raf = 0;
    anchorRef.current = performance.now();

    const unsub = source.onFix((f) => {
      if (mounted) handleFix(f);
    });

    source.start().catch((e: unknown) => {
      if (mounted) setError(e instanceof Error ? e.message : String(e));
    });

    const tick = () => {
      if (!mounted) return;
      const snap = processorRef.current.getSnapshot(nowNs());
      setState(snap);
      feedFrame(snap, performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      unsub();
      source.stop();
    };
  }, [source, handleFix, feedFrame, nowNs]);

  // Keep the screen on while the app shows realtime data; release on unmount.
  useEffect(() => {
    void screenLock.request();
    return () => {
      void screenLock.release();
    };
  }, [screenLock]);

  const m2Actions = useMemo<M2Actions>(
    () => ({
      startSession: () => {
        sessionRef.current.start(performance.now());
        syncM2(performance.now());
      },
      stopSession: () => {
        sessionRef.current.stop(performance.now());
        // The line is an in-session tool (SPEC M2-O3): STOP clears it.
        thresholdRef.current.setLimit(null);
        syncM2(performance.now());
      },
      resumeSession: () => {
        sessionRef.current.resume(performance.now());
        syncM2(performance.now());
      },
      dismissSummary: () => {
        sessionRef.current.dismiss();
        syncM2(performance.now());
      },
      acceptSuggestion: () => {
        sessionRef.current.acceptSuggestion(performance.now());
        syncM2(performance.now());
      },
      dismissSuggestion: () => {
        sessionRef.current.dismissSuggestion();
        syncM2(performance.now());
      },
      stepLimit: (deltaKmh: number) => {
        const next = stepThreshold(
          thresholdRef.current.limit(),
          latestSpeedRef.current,
          deltaKmh,
        );
        thresholdRef.current.setLimit(next);
        syncM2(performance.now());
      },
      clearLimit: () => {
        thresholdRef.current.setLimit(null);
        syncM2(performance.now());
      },
    }),
    [syncM2],
  );

  const chip: ChipView = chipFor({
    permission: location.permission,
    providerEnabled: location.providerEnabled,
    watchActive: location.watchActive,
    lastErrorCode: location.lastErrorCode,
    fixState: state.fixState,
    fixAgeMs: state.fixAgeMs,
  });

  return {
    state,
    unit,
    setUnit,
    mode,
    setMode,
    error,
    debug,
    location,
    chip,
    allowLocation,
    m2,
    m2Actions,
  };
}
