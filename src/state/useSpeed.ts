// useSpeed: the single data layer both Drive and HUD modes render from.
// Wires SpeedSource -> SpeedProcessor -> React state, with a rAF tick so
// staleness progresses even when fixes stop arriving (tunnel). Also owns the
// trip recorder, keep-awake, and trip persistence through the seams.

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeedProcessor } from '../core/pipeline';
import { TripRecorder, TripSummary } from '../core/tripRecorder';
import { DisplayState, RawFix } from '../core/types';
import { Unit } from '../core/units';
import { ScreenLock } from '../platform/ScreenLock';
import { SpeedSource } from '../platform/SpeedSource';
import { StoredTrip, TripStore } from '../platform/TripStore';

export type DriveMode = 'drive' | 'hud';

/** Debug instrumentation shape (SPEC O4 drive-test overlay). */
export interface VmDebug {
  rawSpeedMps: number | null;
  fixCount: number;
  lastIntervalMs: number | null;
}

export interface SpeedViewModel {
  state: DisplayState;
  unit: Unit;
  setUnit: (u: Unit) => void;
  mode: DriveMode;
  setMode: (m: DriveMode) => void;
  tripRunning: boolean;
  tripSummary: TripSummary;
  trips: StoredTrip[];
  startTrip: () => void;
  stopTrip: () => void;
  error: string | null;
  /** Debug instrumentation (SPEC O4): last raw speed, accepted-fix count, fix interval. */
  debug: VmDebug;
}

const NS_PER_MS = 1_000_000;

const EMPTY_SUMMARY: TripSummary = {
  distanceM: 0,
  elapsedMs: 0,
  avgSpeedMps: 0,
  maxSpeedMps: 0,
  startedAtMs: null,
  endedAtMs: null,
  samples: 0,
};

export function useSpeed(
  source: SpeedSource,
  screenLock: ScreenLock,
  tripStore: TripStore,
  opts?: { unit?: Unit; mode?: DriveMode },
): SpeedViewModel {
  const processorRef = useRef(new SpeedProcessor());
  const recorderRef = useRef(new TripRecorder());
  const anchorRef = useRef<number>(0); // performance.now() anchor for monotonic ns
  const lastFixNsRef = useRef<bigint | null>(null);
  const rawSpeedRef = useRef<number | null>(null);
  const fixCountRef = useRef(0);
  const lastIntervalRef = useRef<number | null>(null);

  const [state, setState] = useState<DisplayState>(() =>
    processorRef.current.getSnapshot(0n),
  );
  const [unit, setUnit] = useState<Unit>(opts?.unit ?? 'kmh');
  const [mode, setMode] = useState<DriveMode>(opts?.mode ?? 'drive');
  const [tripRunning, setTripRunning] = useState(false);
  const [tripSummary, setTripSummary] = useState<TripSummary>(EMPTY_SUMMARY);
  const [trips, setTrips] = useState<StoredTrip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<VmDebug>({
    rawSpeedMps: null,
    fixCount: 0,
    lastIntervalMs: null,
  });

  const nowNs = useCallback((): bigint => {
    return BigInt(Math.round(performance.now() * NS_PER_MS));
  }, []);

  // Handle one raw fix: feed processor, feed recorder, refresh state.
  const handleFix = useCallback(
    (fix: RawFix) => {
      const proc = processorRef.current;
      proc.pushFix(fix);

      rawSpeedRef.current = fix.hasSpeed ? fix.speedMps : null;
      fixCountRef.current += 1;
      if (lastFixNsRef.current !== null) {
        lastIntervalRef.current = Number(fix.elapsedRealtimeNanos - lastFixNsRef.current) / 1e9 * 1000;
      }
      lastFixNsRef.current = fix.elapsedRealtimeNanos;

      if (recorderRef.current.isRunning()) {
        recorderRef.current.addFix(fix, proc.smoothedSpeed(), performance.now());
        setTripSummary(recorderRef.current.summary(performance.now()));
      }

      setState(proc.getSnapshot(nowNs()));
      setDebug({
        rawSpeedMps: rawSpeedRef.current,
        fixCount: fixCountRef.current,
        lastIntervalMs: lastIntervalRef.current,
      });
    },
    [nowNs],
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
      setState(processorRef.current.getSnapshot(nowNs()));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      unsub();
      source.stop();
    };
  }, [source, handleFix, nowNs]);

  // Load stored trips once.
  useEffect(() => {
    tripStore.list().then(setTrips).catch(() => setTrips([]));
  }, [tripStore]);

  const startTrip = useCallback(() => {
    recorderRef.current.start(performance.now());
    setTripRunning(true);
    setTripSummary(recorderRef.current.summary(performance.now()));
    void screenLock.request(); // keep-awake while a trip is active
  }, [screenLock]);

  const stopTrip = useCallback(() => {
    const summary = recorderRef.current.stop(performance.now());
    setTripRunning(false);
    setTripSummary(summary);
    void screenLock.release();
    tripStore.save(summary).then((stored) => {
      setTrips((prev) => [stored, ...prev]);
    }).catch(() => setTrips([]));
  }, [screenLock, tripStore]);

  return {
    state,
    unit,
    setUnit,
    mode,
    setMode,
    tripRunning,
    tripSummary,
    trips,
    startTrip,
    stopTrip,
    error,
    debug,
  };
}
