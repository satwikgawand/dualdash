// The hidden diagnostics gate (SPEC M2-O7): five taps open the overlay.

import { describe, expect, it } from 'vitest';
import {
  DEBUG_GATE_TAPS,
  DEBUG_GATE_WINDOW_MS,
  gateOpen,
  gateTaps,
} from '../src/components/debugGate';

describe('debug gate', () => {
  it('opens on five taps inside the window', () => {
    let history: number[] = [];
    for (let i = 0; i < DEBUG_GATE_TAPS; i++) {
      history = gateTaps(history, 1000 + i * 400);
    }
    expect(history).toHaveLength(DEBUG_GATE_TAPS);
    expect(gateOpen(history)).toBe(true);
  });

  it('stays closed on four taps', () => {
    let history: number[] = [];
    for (let i = 0; i < DEBUG_GATE_TAPS - 1; i++) {
      history = gateTaps(history, i * 400);
    }
    expect(gateOpen(history)).toBe(false);
  });

  it('forgets taps that fell out of the window', () => {
    let history: number[] = [];
    for (let i = 0; i < 4; i++) history = gateTaps(history, i * 4000); // 4 s apart
    expect(history).toHaveLength(1);
    expect(gateOpen(history)).toBe(false);
  });

  it('keeps a tap exactly on the window edge', () => {
    const history = gateTaps([0], DEBUG_GATE_WINDOW_MS);
    expect(history).toHaveLength(2);
  });

  it('the threshold is five and the window is three seconds', () => {
    expect(DEBUG_GATE_TAPS).toBe(5);
    expect(DEBUG_GATE_WINDOW_MS).toBe(3000);
  });
});
