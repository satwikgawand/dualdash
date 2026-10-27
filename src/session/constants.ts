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
  /**
   * Smoothing time constant for the phone's own compass (SPEC M2-O9).
   * Parked, the driver rotates the phone by hand and expects the tape to
   * follow inside one glance: 300 ms lands in the same 200-300 ms follow
   * family as the tape's own 250 ms transition (M2-O6). At speed the M2-O4
   * 1.5 s constant stays — a GPS course at 25 m/s is noisy, and the ring
   * must read smooth, not twitchy.
   */
  TAU_ORIENTATION_MS: 300,
  /**
   * Stuck-bearing guard (SPEC M2-O9, hypothesis H2): a provider can send a
   * constant bearing forever — it is finite, so M2-O8 fused it and the tape
   * sat at North while the car drove. Zero variance means every bearing in
   * the window stays within this epsilon of the window's first value; 0.5°
   * absorbs the last-digit jitter of a real bearing without hiding a real
   * turn.
   */
  STUCK_BEARING_EPS_DEG: 0.5,
  /** The bearing must hold still this long before it counts as stuck. */
  STUCK_BEARING_WINDOW_MS: 30_000,
  /**
   * ... and the derived course must have turned this far inside that window
   * to prove the car really moved while the bearing did not. A stuck 0° on a
   * straight road north is harmless; a stuck 0° while the course swings 20°
   * is the North-peg bug.
   */
  STUCK_COURSE_DELTA_DEG: 20,
} as const;

/**
 * Phone-orientation source (SPEC M2-O9): readings older than this are
 * dropped, so a sensor that dies mid-session falls back to the dimmed idle
 * instead of holding a stale heading. Generous against a WebView that
 * delivers at tens of hertz while the screen is on.
 */
export const ORIENTATION = {
  STALE_AFTER_MS: 5_000,
  /**
   * Grace period for the first reading after start. The API can exist and
   * still deliver nothing (wrong WebView build, sensor missing) — the
   * overlay's `orientation: off` plus this timeout is what tells us the
   * web route is insufficient and the native sensors plugin is needed.
   */
  FIRST_READ_TIMEOUT_MS: 3_000,
} as const;

/** Derived-course fallback (SPEC M2-O8). */
export const COURSE = {
  /**
   * Minimum displacement between the two fixes used for the derived course.
   * Below this the azimuth is noise: at the typical 3-8 m horizontal error a
   * short baseline swings wildly. 5 m matches the pipeline's own restart
   * displacement (PIPELINE.RESTART_DISPLACEMENT_M) — the smallest travel the
   * speed pipeline trusts — so the course gate and the speed gate agree on
   * what counts as real movement.
   */
  MIN_DERIVE_DISPLACEMENT_M: 5,
} as const;
