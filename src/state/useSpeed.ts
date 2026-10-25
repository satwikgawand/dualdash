// useSpeed: the single data layer both Drive and HUD modes render from.
// Wires SpeedSource -> SpeedProcessor -> React state, with a rAF tick so
// staleness progresses even when fixes stop arriving (tunnel). Also owns
// keep-awake while the app shows realtime data. Nothing is persisted: the
// view model lives in component memory only (SPEC M1-O5, realtime-only).

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeedProcessor } from '../core/pipeline';
import { DisplayState, RawFix } from '../core/types';
import { Unit } from '../core/units';
import { ScreenLock } from '../platform/ScreenLock';
import { SpeedSource } from '../platform/SpeedSource';

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
  error: string | null;
  /** Debug instrumentation (SPEC O4): last raw speed, accepted-fix count, fix interval. */
  debug: VmDebug;
}

const NS_PER_MS = 1_000_000;

export function useSpeed(
  source: SpeedSource,
  screenLock: ScreenLock,
  opts?: { unit?: Unit; mode?: DriveMode },
): SpeedViewModel {
  const processorRef = useRef(new SpeedProcessor());
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
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<VmDebug>({
    rawSpeedMps: null,
    fixCount: 0,
    lastIntervalMs: null,
  });

  const nowNs = useCallback((): bigint => {
    return BigInt(Math.round(performance.now() * NS_PER_MS));
  }, []);

  // Handle one raw fix: feed processor, refresh state.
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

  // Keep the screen on while the app shows realtime data; release on unmount.
  useEffect(() => {
    void screenLock.request();
    return () => {
      void screenLock.release();
    };
  }, [screenLock]);

  return {
    state,
    unit,
    setUnit,
    mode,
    setMode,
    error,
    debug,
  };
}
