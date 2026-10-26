// M2 session / alert / heading constants (SPEC M2-O1 .. M2-O4).
// Every threshold carries the reason it exists, so a future tune-up starts
// from the "why", not the number. Nothing here is persisted (SPEC M1-O5).

/** Session policy (SPEC M2-O1: manual START/STOP, silent auto-pause). */
export const SESSION = {
  /**
   * Auto-pause: smoothed speed at/below this counts as "stationary".
   * A parked car's GNSS drift reports 0-3 km/h (0-0.83 m/s); 1 m/s sits just
   * above that band, so drift counts as stopped but slow creep does not.
   */
  AUTO_PAUSE_SPEED_MPS: 1,
  /**
   * Stationary this long while running => silent auto-pause.
   * 90 s covers a long light or a fuel stop without pausing at ordinary
   * red lights (contract: stationary > 90 s).
   */
  AUTO_PAUSE_STATIONARY_MS: 90_000,
  /**
   * Auto-resume: smoothed speed must reach this. 3 m/s (~11 km/h) is well
   * above drift and GNSS jitter, so a parked car never self-resumes
   * (contract: >= 3 m/s).
   */
  AUTO_RESUME_SPEED_MPS: 3,
  /**
   * ... and hold for this long. One 3 m/s glitch cannot resume a session;
   * real movement sustains it (contract: "~2 s").
   */
  AUTO_RESUME_HOLD_MS: 2_000,
  /**
   * Start suggestion: smoothed speed above 5 km/h means the car is really
   * moving, not creeping in a parking lot (contract: > 5 km/h).
   */
  SUGGEST_SPEED_MPS: 5 / 3.6,
  /**
   * ... sustained this long before the chip may appear. A slow roll into a
   * lot does not nag (contract: "sustained 10 s").
   */
  SUGGEST_HOLD_MS: 10_000,
  /**
   * The chip hides after this long without a tap. Hiding counts as
   * "ignored" and starts the cooldown (SPEC M2-O2).
   */
  SUGGEST_VISIBLE_MS: 15_000,
  /**
   * After an ignore, do not suggest again for 10 minutes (contract:
   * "re-suggest at most once per 10 min").
   */
  SUGGEST_COOLDOWN_MS: 600_000,
} as const;

/** Threshold alert (SPEC M2-O3). */
export const ALERT = {
  /** Quick-stepper step in km/h (contract: +/-5, +/-10). */
  STEP_KMH: 5,
  /** Big stepper step in km/h. */
  STEP_BIG_KMH: 10,
  /** While continuously over the line: at most one buzz per 15 s. */
  REFIRE_MS: 15_000,
  /**
   * Re-arm hysteresis: fall this far below the line before the alert can
   * fire again. Without it the buzz dances at the boundary
   * (contract: ~1 km/h).
   */
  HYSTERESIS_KMH: 1,
  /** Lowest limit the stepper will set; below this the alert is noise. */
  MIN_LIMIT_KMH: 5,
} as const;

/** Rotating compass (SPEC M2-O4). */
export const HEADING = {
  /**
   * GPS course is unreliable below walking-plus pace; below this the ring
   * suppresses to "--" instead of showing noise (contract: ~3 m/s).
   */
  MIN_SPEED_MPS: 3,
  /**
   * Exponential-filter time constant. ~63% of a turn is absorbed in 1.5 s
   * and >95% within ~4.5 s: the ring reads smooth at speed but still
   * follows a real turn within a couple of seconds.
   */
  TAU_MS: 1500,
  /**
   * After suppression longer than this, re-seed the filter from the new
   * sample instead of easing from the old heading: a car that stood still
   * long enough may have been turned (parking manoeuvre).
   */
  RESEED_AFTER_SUPPRESSED_MS: 30_000,
} as const;
