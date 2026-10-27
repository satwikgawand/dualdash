// The hidden diagnostics gate (SPEC M2-O7). The drive-test overlay ships
// HIDDEN: five taps on the status/chip row within the window open it, and the
// same five taps close it again. RAM-only — the revealed state lives in
// component memory and resets on reload, like everything else (SPEC M1-O5).
//
// The counting is pure so the suite can prove the gate without a DOM.

import { useCallback, useRef, useState } from 'react';

/** Taps needed to flip the overlay. */
export const DEBUG_GATE_TAPS = 5;
/** Taps older than this are forgotten, so a stray tap sequence never opens it. */
export const DEBUG_GATE_WINDOW_MS = 3000;

/**
 * Append one tap, dropping taps that fell out of the window. Returns the new
 * history — the caller stores it and asks `gateOpen` whether to flip.
 */
export function gateTaps(
  history: readonly number[],
  nowMs: number,
  windowMs: number = DEBUG_GATE_WINDOW_MS,
): number[] {
  return [...history.filter((t) => nowMs - t <= windowMs), nowMs];
}

/** True when the (in-window) tap count reaches the threshold. */
export function gateOpen(history: readonly number[], required: number = DEBUG_GATE_TAPS): boolean {
  return history.length >= required;
}

/** RAM-only overlay visibility, driven by the tap gate. */
export function useDebugGate(): {
  revealed: boolean;
  onGateTap: () => void;
  hide: () => void;
} {
  const [revealed, setRevealed] = useState(false);
  const historyRef = useRef<number[]>([]);

  const onGateTap = useCallback(() => {
    const history = gateTaps(historyRef.current, performance.now());
    historyRef.current = history;
    if (gateOpen(history)) {
      historyRef.current = [];
      setRevealed((open) => !open);
    }
  }, []);

  const hide = useCallback(() => setRevealed(false), []);

  return { revealed, onGateTap, hide };
}
