// Table-driven tests for the M2 session state machine (SPEC M2-O1/O2).
//
// Rows cover: manual start/stop, the summary freeze, silent auto-pause with
// its 90 s boundary, auto-resume with the 3 m/s / 2 s gate, manual resume,
// pause-time accounting (elapsed excludes paused), fix-to-fix distance,
// max speed, and the exactly-once suggestion nag guard (tap / x / ignore
// cooldown). src/core is untouched by all of this.

import { describe, expect, it } from 'vitest';
import {
  SessionFix,
  SessionMachine,
  SessionSnapshot,
} from '../src/session/sessionMachine';
import { SESSION } from '../src/session/constants';

const kmh = (k: number) => k / 3.6;
const START_POS = { lat: 12.9716, lon: 77.5946 };
/** ~11.12 m of northward movement per fix (0.0001 deg of latitude). */
const NORTH_STEP = 0.0001;

function fixAt(tMs: number, speedMps: number, northSteps = 0): SessionFix {
  return {
    tMs,
    speedMps,
    lat: START_POS.lat + northSteps * NORTH_STEP,
    lon: START_POS.lon,
  };
}

/** Feed n fixes 1 s apart, moving north, at a constant speed. */
function drive(m: SessionMachine, fromT: number, n: number, speedMps: number, fromStep = 0): void {
  for (let i = 0; i < n; i++) {
    m.onFix(fixAt(fromT + i * 1000, speedMps, fromStep + i));
  }
}

function lastT(fromT: number, n: number): number {
  return fromT + (n - 1) * 1000;
}

/** Feed n fixes 1 s apart at ONE fixed position: a genuinely parked car. */
function park(m: SessionMachine, fromT: number, n: number, speedMps = 0, step = 0): void {
  for (let i = 0; i < n; i++) {
    m.onFix(fixAt(fromT + i * 1000, speedMps, step));
  }
}

describe('session: manual start / stop / summary', () => {
  const cases: Array<{
    name: string;
    run: (m: SessionMachine) => void;
    expectPhase: SessionSnapshot['phase'];
    expectSummary: boolean;
  }> = [
    {
      name: 'fresh machine is idle with no summary',
      run: () => {},
      expectPhase: 'idle',
      expectSummary: false,
    },
    {
      name: 'start() -> running',
      run: (m) => m.start(0),
      expectPhase: 'running',
      expectSummary: false,
    },
    {
      name: 'start() then stop() -> summary with frozen stats',
      run: (m) => {
        m.start(0);
        drive(m, 1000, 5, kmh(36)); // 5 fixes at 10 m/s
        m.stop(5000);
      },
      expectPhase: 'summary',
      expectSummary: true,
    },
    {
      name: 'stop() while paused also freezes the summary',
      run: (m) => {
        m.start(0);
        drive(m, 1000, 2, 0); // park immediately, long enough to auto-pause
        drive(m, 3000, SESSION.AUTO_PAUSE_STATIONARY_MS / 1000, 0);
        m.stop(200_000);
      },
      expectPhase: 'summary',
      expectSummary: true,
    },
    {
      name: 'dismiss() returns to idle and clears the summary',
      run: (m) => {
        m.start(0);
        m.stop(1000);
        m.dismiss();
      },
      expectPhase: 'idle',
      expectSummary: false,
    },
    {
      name: 'stop() from idle is ignored (never a phantom summary)',
      run: (m) => m.stop(0),
      expectPhase: 'idle',
      expectSummary: false,
    },
    {
      name: 'start() from summary is ignored until dismissed',
      run: (m) => {
        m.start(0);
        m.stop(1000);
        m.start(2000);
      },
      expectPhase: 'summary',
      expectSummary: true,
    },
    {
      name: 'start() while running is a no-op (no reset mid-drive)',
      run: (m) => {
        m.start(0);
        drive(m, 1000, 3, kmh(36));
        m.start(5000);
      },
      expectPhase: 'running',
      expectSummary: false,
    },
    {
      name: 'resume() from paused -> running',
      run: (m) => {
        m.start(0);
        drive(m, 1000, 2, 0);
        drive(m, 3000, SESSION.AUTO_PAUSE_STATIONARY_MS / 1000, 0);
        m.resume(150_000);
      },
      expectPhase: 'running',
      expectSummary: false,
    },
    {
      name: 'a session never auto-ends: parked forever stays paused, not summary',
      run: (m) => {
        m.start(0);
        drive(m, 1000, 2, kmh(20));
        drive(m, 3000, 3600, 0); // one hour parked
      },
      expectPhase: 'paused',
      expectSummary: false,
    },
  ];

  it.each(cases)('$name', ({ run, expectPhase, expectSummary }) => {
    const m = new SessionMachine();
    run(m);
    const snap = m.snapshot(4_000_000);
    expect(snap.phase).toBe(expectPhase);
    expect(snap.summary !== null).toBe(expectSummary);
  });
});

describe('session: silent auto-pause (stationary > 90 s)', () => {
  const cases: Array<{
    name: string;
    /** Fixes: [startT, count, speed m/s] fed in order. */
    segments: Array<[number, number, number]>;
    expectPhase: SessionSnapshot['phase'];
  }> = [
    {
      name: 'stationary 89 s is still running (below the 90 s boundary)',
      segments: [[1000, 90, 0]],
      expectPhase: 'running',
    },
    {
      name: 'stationary 90 s pauses (>= boundary)',
      segments: [[1000, 91, 0]],
      expectPhase: 'paused',
    },
    {
      name: 'moving fixes reset the stationary clock: never pauses',
      segments: [[1000, 600, kmh(30)]],
      expectPhase: 'running',
    },
  ];

  it.each(cases)('$name', ({ segments, expectPhase }) => {
    const m = new SessionMachine();
    m.start(0);
    let lastMs = 0;
    for (const [t, n, speed] of segments) {
      drive(m, t, n, speed);
      lastMs = lastT(t, n);
    }
    expect(m.snapshot(lastMs + 1).phase).toBe(expectPhase);
  });

  it('a stop-and-go pattern (0 / 50 km/h alternating) never pauses', () => {
    const m = new SessionMachine();
    m.start(0);
    for (let i = 0; i < 600; i++) {
      m.onFix(fixAt(1000 + i * 1000, i % 2 === 0 ? 0 : kmh(50)));
    }
    expect(m.snapshot(700_000).phase).toBe('running');
  });
});

describe('session: auto-resume (>= 3 m/s held ~2 s) and manual resume', () => {
  const cases: Array<{
    name: string;
    /** Paused-phase fixes as [tMs, speed m/s]. */
    fixes: Array<[number, number]>;
    expectPhase: SessionSnapshot['phase'];
  }> = [
    {
      name: '3 m/s held for 2 s resumes',
      fixes: [
        [100_000, 3],
        [101_000, 3],
        [102_000, 3],
      ],
      expectPhase: 'running',
    },
    {
      name: 'a single 3 m/s spike below 2 s does not resume',
      fixes: [
        [100_000, 3],
        [101_000, 0],
        [102_000, 3],
        [103_000, 0],
      ],
      expectPhase: 'paused',
    },
    {
      name: 'sustained 2.9 m/s (below the gate) never resumes',
      fixes: [
        [100_000, 2.9],
        [101_000, 2.9],
        [102_000, 2.9],
        [103_000, 2.9],
      ],
      expectPhase: 'paused',
    },
    {
      name: 'the hold must be continuous: 3, pause, 3 does not resume',
      fixes: [
        [100_000, 3],
        [101_500, 0],
        [102_000, 3],
        [103_000, 3],
        [104_000, 3],
      ],
      expectPhase: 'running',
    },
  ];

  it.each(cases)('$name', ({ fixes, expectPhase }) => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 2, kmh(30));
    drive(m, 3000, 91, 0); // auto-pause at t = 3000 + 90_000
    for (const [t, speed] of fixes) m.onFix(fixAt(t, speed));
    expect(m.snapshot(fixes[fixes.length - 1][0] + 1).phase).toBe(expectPhase);
  });

  it('manual resume() works immediately from paused', () => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 2, kmh(30));
    drive(m, 3000, 91, 0);
    expect(m.snapshot(100_000).phase).toBe('paused');
    m.resume(100_500);
    expect(m.snapshot(100_500).phase).toBe('running');
  });
});

describe('session: elapsed excludes paused time; distance and max speed', () => {
  it('elapsed counts running segments only', () => {
    const m = new SessionMachine();
    m.start(1000);
    drive(m, 1000, 10, kmh(36)); // moving t=1000..10_000
    drive(m, 11_000, 91, 0); // stationary from t=11_000; auto-pause at t=101_000
    m.resume(120_000);
    drive(m, 121_000, 10, kmh(36)); // moving t=121_000..130_000
    const stats = m.snapshot(130_000).stats;
    // Moving time: 1000->11_000 plus 120_000->130_000. The stationary
    // window is cut at auto-pause; the paused stretch never counts.
    expect(stats.elapsedMs).toBe(20_000);
  });

  it('distance is the fix-to-fix displacement sum while running', () => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 4, kmh(36)); // 3 segments of ~11.12 m
    // 0.0001 deg of latitude at R=6371000 m is ~11.119 m.
    expect(m.snapshot(4000).stats.distanceM).toBeCloseTo(3 * 11.119, 1);
  });

  it('distance does not accumulate while paused (drift adds nothing)', () => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 4, kmh(36)); // ends at position step 3
    const before = m.snapshot(4000).stats.distanceM;
    park(m, 5000, 91, 0, 3); // auto-pause at ~t=95_000
    expect(m.snapshot(100_000).phase).toBe('paused');
    // While parked the GPS drifts: fixes crawl north, but a paused session
    // accumulates no distance.
    for (let i = 0; i < 30; i++) {
      m.onFix(fixAt(101_000 + i * 1000, 0.4, 3 + i * 0.1));
    }
    expect(m.snapshot(131_000).stats.distanceM).toBeCloseTo(before, 6);
  });

  it('resume re-anchors: the first fix after resume adds no jump distance', () => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 4, kmh(36)); // ends at position step 3
    const before = m.snapshot(4000).stats.distanceM;
    park(m, 5000, 91, 0, 3); // auto-pause at ~t=95_000
    m.resume(100_000);
    // The car "teleports" 1 km north while we were paused (GPS gap).
    m.onFix(fixAt(101_000, kmh(36), 90));
    expect(m.snapshot(101_000).stats.distanceM).toBeCloseTo(before, 6);
  });

  it('avg speed is distance / elapsed and max is the peak while running', () => {
    const m = new SessionMachine();
    m.start(1000);
    drive(m, 1000, 11, kmh(36)); // 10 s at 10 m/s, 10 segments of ~11.119 m
    const stats = m.snapshot(11_000).stats;
    expect(stats.maxSpeedMps).toBeCloseTo(10, 6);
    expect(stats.elapsedMs).toBe(10_000);
    expect(stats.avgSpeedMps).toBeCloseTo(stats.distanceM / 10, 6);
  });

  it('max speed ignores the paused stretch', () => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 4, kmh(36)); // max 10 m/s while running
    drive(m, 5000, 91, 0);
    expect(m.snapshot(100_000).phase).toBe('paused');
    expect(m.snapshot(100_000).stats.maxSpeedMps).toBeCloseTo(10, 6);
  });

  it('the summary freezes the stats at STOP time', () => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 11, kmh(36));
    m.stop(12_000);
    const frozen = m.snapshot(12_000).summary;
    expect(frozen).not.toBeNull();
    expect(frozen!.elapsedMs).toBe(12_000);
    // Much later read: unchanged.
    expect(m.snapshot(999_000).summary!.elapsedMs).toBe(12_000);
    expect(m.snapshot(999_000).stats.elapsedMs).toBe(12_000);
    // The LIVE counters go to zero at stop: idle never shows old totals.
    m.dismiss();
    expect(m.snapshot(1_000_000).stats.distanceM).toBe(0);
    expect(m.snapshot(1_000_000).stats.elapsedMs).toBe(0);
    expect(m.snapshot(1_000_000).stats.maxSpeedMps).toBe(0);
  });

  it('a new session starts from zero', () => {
    const m = new SessionMachine();
    m.start(0);
    drive(m, 1000, 11, kmh(36));
    m.stop(12_000);
    m.dismiss();
    m.start(20_000);
    const stats = m.snapshot(21_000).stats;
    expect(stats.distanceM).toBe(0);
    expect(stats.elapsedMs).toBe(1000);
    expect(stats.maxSpeedMps).toBe(0);
  });
});

describe('session: suggestion nag guard (exactly once per drive)', () => {
  /** Idle machine + one fix per second at a constant speed. */
  function idleDriving(speedKmh: number): SessionMachine {
    const m = new SessionMachine();
    m.onFix(fixAt(1000, kmh(speedKmh)));
    return m;
  }

  const cases: Array<{
    name: string;
    run: (m: SessionMachine) => void;
    expectVisible: boolean;
    expectSuppressed: boolean;
  }> = [
    {
      name: 'no session + > 5 km/h sustained 10 s -> chip appears',
      run: (m) => {
        for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
      },
      expectVisible: true,
      expectSuppressed: false,
    },
    {
      name: 'below 10 s of evidence -> no chip',
      run: (m) => {
        for (let t = 2000; t <= 9_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
      },
      expectVisible: false,
      expectSuppressed: false,
    },
    {
      name: 'exactly 5 km/h (not > 5) never suggests',
      run: (m) => {
        for (let t = 2000; t <= 61_000; t += 1000) m.onFix(fixAt(t, kmh(5)));
      },
      expectVisible: false,
      expectSuppressed: false,
    },
    {
      name: 'x on the chip suppresses it for the whole process (30 min drive)',
      run: (m) => {
        for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
        m.dismissSuggestion();
        for (let t = 12_000; t <= 1_800_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
      },
      expectVisible: false,
      expectSuppressed: true,
    },
    {
      name: 'tap on the chip starts the session and hides it',
      run: (m) => {
        for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
        m.acceptSuggestion(11_500);
      },
      expectVisible: false,
      expectSuppressed: false,
    },
    {
      name: 'an ignored chip (let it time out) re-suggests after the 10 min cooldown',
      run: (m) => {
        for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
        // Visible at t=11_000; ignored at 11_000 + 15_000 = 26_000.
        m.tick(26_000);
        // Cooldown until 626_000; keep driving through it.
        for (let t = 27_000; t <= 640_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
      },
      expectVisible: true,
      expectSuppressed: false,
    },
    {
      name: 'no re-suggest inside the cooldown even with continuous evidence',
      run: (m) => {
        for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
        m.tick(26_000); // ignored at 26_000; cooldown until 626_000
        for (let t = 27_000; t <= 600_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
      },
      expectVisible: false,
      expectSuppressed: false,
    },
    {
      name: 'slowing below 5 km/h while the chip is up counts as ignored (cooldown)',
      run: (m) => {
        for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
        m.onFix(fixAt(12_000, 0)); // chip lapses -> cooldown until 612_000
        for (let t = 13_000; t <= 500_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
      },
      expectVisible: false,
      expectSuppressed: false,
    },
    {
      name: 'no chip while a session is running, even at speed',
      run: (m) => {
        m.start(0);
        for (let t = 2000; t <= 61_000; t += 1000) m.onFix(fixAt(t, kmh(60)));
      },
      expectVisible: false,
      expectSuppressed: false,
    },
    {
      name: 'after a session ends, a chip may come back (fresh evidence, cooldown clear)',
      run: (m) => {
        m.start(0);
        drive(m, 1000, 5, kmh(60));
        m.stop(6000);
        m.dismiss();
        for (let t = 7000; t <= 17_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
      },
      expectVisible: true,
      expectSuppressed: false,
    },
  ];

  it.each(cases)('$name', ({ run, expectVisible, expectSuppressed }) => {
    const m = new SessionMachine();
    m.onFix(fixAt(1000, kmh(8)));
    run(m);
    const snap = m.snapshot(5_000_000);
    expect(snap.suggestVisible).toBe(expectVisible);
    expect(snap.suggestSuppressed).toBe(expectSuppressed);
  });

  it('accepting the suggestion clears evidence so the next idle start is fresh', () => {
    const m = idleDriving(8);
    for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
    expect(m.snapshot(11_000).suggestVisible).toBe(true);
    m.acceptSuggestion(11_500);
    expect(m.snapshot(11_500).phase).toBe('running');
    expect(m.snapshot(11_500).suggestVisible).toBe(false);
  });

  it('dismissSuggestion after accept sets the suppress flag but the session runs on', () => {
    const m = idleDriving(8);
    for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
    m.acceptSuggestion(11_500);
    m.dismissSuggestion(); // after accept: suppressed flag set, but session runs
    expect(m.snapshot(12_000).phase).toBe('running');
    expect(m.snapshot(12_000).suggestSuppressed).toBe(true);
  });

  it('the chip never reappears on its own after suppression, even across sessions', () => {
    const m = idleDriving(8);
    for (let t = 2000; t <= 11_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
    m.dismissSuggestion();
    m.start(12_000);
    drive(m, 13_000, 10, kmh(60));
    m.stop(23_000);
    m.dismiss();
    for (let t = 24_000; t <= 1_000_000; t += 1000) m.onFix(fixAt(t, kmh(8)));
    expect(m.snapshot(1_000_000).suggestVisible).toBe(false);
    expect(m.snapshot(1_000_000).suggestSuppressed).toBe(true);
  });
});
