// SessionMachine: the M2 session state machine (SPEC M2-O1/O2).
//
// Pure logic. No React, no platform calls, no wall clock: the caller passes
// monotonic milliseconds (performance.now()), so the whole machine is
// deterministic and unit-testable off-device. All state lives here in RAM —
// a reload resets everything (SPEC M1-O5: nothing survives).
//
//   idle --start(t)--> running --stop(t)--> summary --dismiss--> idle
//   running --stationary > 90 s--> paused --movement 3 m/s for 2 s / resume(t)--> running
//
// Rules the machine enforces (owner contract):
//   - NEVER auto-ends a session; only the driver stops it.
//   - Paused time is excluded from elapsed; avg = distance / elapsed.
//   - Distance accumulates fix-to-fix while running, never while paused.
//   - Start suggestion: > 5 km/h sustained 10 s while idle; tap starts,
//     x suppresses for the process lifetime, an ignore starts a 10 min
//     cooldown (SPEC M2-O2 nag guard).

import { haversineM } from '../core/stationary';
import { SESSION } from './constants';

export type SessionPhase = 'idle' | 'running' | 'paused' | 'summary';

export interface SessionStats {
  /** Fix-to-fix displacement sum while running, in metres. */
  distanceM: number;
  /** Running time only — paused time is excluded (SPEC M2-O1). */
  elapsedMs: number;
  /** distance / elapsed (m/s). 0 while no running time has accrued. */
  avgSpeedMps: number;
  /** Highest smoothed speed seen while running, in m/s. */
  maxSpeedMps: number;
}

/** One accepted GPS fix as the session sees it. */
export interface SessionFix {
  /** Monotonic milliseconds (performance.now()). */
  tMs: number;
  /** Smoothed display speed (m/s) from the pipeline snapshot. */
  speedMps: number;
  lat: number;
  lon: number;
}

export interface SessionSnapshot {
  phase: SessionPhase;
  /** Live stats while running/paused (final values once summary is set). */
  stats: SessionStats;
  /** Frozen at STOP; cleared on dismiss. */
  summary: SessionStats | null;
  /** True while the "Start session?" chip is on screen. */
  suggestVisible: boolean;
  /** True once x was tapped: never suggest again this process. */
  suggestSuppressed: boolean;
}

const ZERO: SessionStats = {
  distanceM: 0,
  elapsedMs: 0,
  avgSpeedMps: 0,
  maxSpeedMps: 0,
};

export class SessionMachine {
  private phase: SessionPhase = 'idle';
  private summaryStats: SessionStats | null = null;

  // Running-time accounting: completed segments + the open segment (if any).
  private segmentStartMs: number | null = null;
  private elapsedBaseMs = 0;

  // Distance / speed accumulators (running only).
  private distanceM = 0;
  private maxSpeedMps = 0;
  private lastPos: { lat: number; lon: number } | null = null;

  // Auto-pause / auto-resume evidence (SPEC M2-O1).
  private stationarySinceMs: number | null = null;
  private resumeSinceMs: number | null = null;

  // Suggestion nag guard (SPEC M2-O2).
  private suggestVisible = false;
  private suggestVisibleSinceMs: number | null = null;
  private suggestEvidenceSinceMs: number | null = null;
  private suggestSuppressed = false;
  private suggestCooldownUntilMs = 0;

  // ---- driver actions -------------------------------------------------------

  /** Manual START (or suggestion tap). Valid only from idle. */
  start(tMs: number): void {
    if (this.phase !== 'idle') return;
    this.phase = 'running';
    this.segmentStartMs = tMs;
    this.elapsedBaseMs = 0;
    this.distanceM = 0;
    this.maxSpeedMps = 0;
    this.lastPos = null;
    this.stationarySinceMs = null;
    this.resumeSinceMs = null;
    this.summaryStats = null;
    // Accepted: hide the chip and restart evidence; no cooldown, no nag.
    this.suggestVisible = false;
    this.suggestVisibleSinceMs = null;
    this.suggestEvidenceSinceMs = null;
  }

  /** Manual STOP. Valid while running or paused. Freezes the summary card. */
  stop(tMs: number): void {
    if (this.phase !== 'running' && this.phase !== 'paused') return;
    if (this.phase === 'running') this.closeSegment(tMs);
    this.summaryStats = this.liveStats(tMs);
    this.phase = 'summary';
    // The summary owns the numbers now; the live counters go to zero so an
    // idle readout never shows a previous session's totals (debug overlay).
    this.distanceM = 0;
    this.maxSpeedMps = 0;
    this.elapsedBaseMs = 0;
    this.segmentStartMs = null;
    this.lastPos = null;
    this.stationarySinceMs = null;
    this.resumeSinceMs = null;
    this.suggestVisible = false;
    this.suggestVisibleSinceMs = null;
    this.suggestEvidenceSinceMs = null;
  }

  /** Dismiss the summary card; back to idle. */
  dismiss(): void {
    if (this.phase !== 'summary') return;
    this.phase = 'idle';
    this.summaryStats = null;
  }

  /** Manual RESUME from the paused state. */
  resume(tMs: number): void {
    if (this.phase !== 'paused') return;
    this.phase = 'running';
    this.segmentStartMs = tMs;
    // Re-anchor: the first fix after resume sets the position without
    // adding the (drift) distance that accumulated while parked.
    this.lastPos = null;
    this.stationarySinceMs = null;
    this.resumeSinceMs = null;
  }

  /** Suggestion chip: tap Start. */
  acceptSuggestion(tMs: number): void {
    if (!this.suggestVisible) return;
    this.suggestVisible = false;
    this.suggestVisibleSinceMs = null;
    this.suggestEvidenceSinceMs = null;
    this.start(tMs);
  }

  /** Suggestion chip: tap x. Never suggest again for this process. */
  dismissSuggestion(): void {
    this.suggestSuppressed = true;
    this.suggestVisible = false;
    this.suggestVisibleSinceMs = null;
    this.suggestEvidenceSinceMs = null;
  }

  // ---- data feeds ------------------------------------------------------------

  /** One accepted GPS fix: distance, max speed, pause/resume evidence, suggestion evidence. */
  onFix(fix: SessionFix): void {
    const t = fix.tMs;

    if (this.phase === 'running') {
      // Distance: fix-to-fix displacement sum (contract definition).
      if (Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) {
        if (this.lastPos !== null) {
          this.distanceM += haversineM(this.lastPos, { lat: fix.lat, lon: fix.lon });
        }
        this.lastPos = { lat: fix.lat, lon: fix.lon };
      }
      if (Number.isFinite(fix.speedMps) && fix.speedMps > this.maxSpeedMps) {
        this.maxSpeedMps = fix.speedMps;
      }

      // Auto-pause: stationary for > 90 s (silent; never a prompt).
      if (fix.speedMps <= SESSION.AUTO_PAUSE_SPEED_MPS) {
        if (this.stationarySinceMs === null) this.stationarySinceMs = t;
        if (t - this.stationarySinceMs >= SESSION.AUTO_PAUSE_STATIONARY_MS) {
          // Moving time only: cut the stationary window out of elapsed.
          this.closeSegment(t, this.stationarySinceMs);
          this.phase = 'paused';
          this.resumeSinceMs = null;
        }
      } else {
        this.stationarySinceMs = null;
      }
    } else if (this.phase === 'paused') {
      // Keep the anchor fresh so resume does not add a drift jump.
      if (Number.isFinite(fix.lat) && Number.isFinite(fix.lon)) {
        this.lastPos = { lat: fix.lat, lon: fix.lon };
      }
      // Auto-resume: >= 3 m/s held for ~2 s (or the driver resumes manually).
      if (fix.speedMps >= SESSION.AUTO_RESUME_SPEED_MPS) {
        if (this.resumeSinceMs === null) this.resumeSinceMs = t;
        if (t - this.resumeSinceMs >= SESSION.AUTO_RESUME_HOLD_MS) {
          this.resume(t);
        }
      } else {
        this.resumeSinceMs = null;
      }
    }

    this.suggestionEvidence(fix.speedMps, t);
  }

  /** Timer feed (rAF tick): suggestion show/timeout. Safe to call at any rate. */
  tick(tMs: number): void {
    if (this.phase !== 'idle') return;
    this.maybeShowSuggestion(tMs);
    if (this.suggestVisible && this.suggestVisibleSinceMs !== null) {
      if (tMs - this.suggestVisibleSinceMs >= SESSION.SUGGEST_VISIBLE_MS) {
        this.ignoreSuggestion(tMs);
      }
    }
  }

  // ---- reads ------------------------------------------------------------------

  snapshot(tMs: number): SessionSnapshot {
    return {
      phase: this.phase,
      stats: this.phase === 'summary' ? (this.summaryStats ?? ZERO) : this.liveStats(tMs),
      summary: this.summaryStats,
      suggestVisible: this.suggestVisible,
      suggestSuppressed: this.suggestSuppressed,
    };
  }

  // ---- internals ---------------------------------------------------------------

  /**
   * Fold the open running segment into elapsedBase. `cutMs` ends the counted
   * time earlier than the fold: at auto-pause the stationary window is cut
   * out, so elapsed is MOVING time (SPEC M2-O1). A manual stop keeps its
   * tail — the driver ended the session, the clock ran until then.
   */
  private closeSegment(tMs: number, cutMs?: number): void {
    if (this.phase === 'running' && this.segmentStartMs !== null) {
      const endMs = cutMs === undefined ? tMs : Math.min(cutMs, tMs);
      this.elapsedBaseMs += Math.max(0, endMs - this.segmentStartMs);
    }
    this.segmentStartMs = null;
  }

  private liveStats(tMs: number): SessionStats {
    let elapsedMs = this.elapsedBaseMs;
    if (this.phase === 'running' && this.segmentStartMs !== null) {
      elapsedMs += Math.max(0, tMs - this.segmentStartMs);
    }
    return {
      distanceM: this.distanceM,
      elapsedMs,
      avgSpeedMps: elapsedMs > 0 ? this.distanceM / (elapsedMs / 1000) : 0,
      maxSpeedMps: this.maxSpeedMps,
    };
  }

  private suggestionEvidence(speedMps: number, tMs: number): void {
    if (this.phase !== 'idle' || this.suggestSuppressed) return;
    if (speedMps > SESSION.SUGGEST_SPEED_MPS) {
      if (this.suggestEvidenceSinceMs === null) this.suggestEvidenceSinceMs = tMs;
    } else {
      this.suggestEvidenceSinceMs = null;
      // The car slowed: premise gone. An on-screen chip that lapses this
      // way counts as ignored (cooldown applies — SPEC M2-O2).
      if (this.suggestVisible) this.ignoreSuggestion(tMs);
    }
    this.maybeShowSuggestion(tMs);
  }

  private maybeShowSuggestion(tMs: number): void {
    if (
      this.phase !== 'idle' ||
      this.suggestVisible ||
      this.suggestSuppressed ||
      this.suggestEvidenceSinceMs === null
    ) {
      return;
    }
    if (tMs - this.suggestEvidenceSinceMs < SESSION.SUGGEST_HOLD_MS) return;
    if (tMs < this.suggestCooldownUntilMs) return;
    this.suggestVisible = true;
    this.suggestVisibleSinceMs = tMs;
  }

  /** Chip went away without a tap (timeout or slowdown): start the cooldown. */
  private ignoreSuggestion(tMs: number): void {
    this.suggestVisible = false;
    this.suggestVisibleSinceMs = null;
    this.suggestEvidenceSinceMs = null;
    this.suggestCooldownUntilMs = tMs + SESSION.SUGGEST_COOLDOWN_MS;
  }
}
