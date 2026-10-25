// Acceleration clamp (gps-speed.md section 3.2).
// A 1 Hz jump larger than MAX_ACCEL * dt is measurement error, not real motion.
// We clamp the step to the physical bound rather than rejecting it, so a genuine
// hard brake/launch still tracks but a single-sample GPS spike is capped.

import { PIPELINE } from './types';

/**
 * Clamp `next` so that the change from `prev` over `dtSeconds` cannot exceed
 * MAX_ACCEL_MPS2 * dtSeconds. dtSeconds is bounded by CLAMP_MAX_DT_S so a long
 * gap (tunnel) does not widen the allowed jump. The first call has no previous
 * value and passes through unchanged.
 */
export function clampAccel(
  prev: number | null,
  next: number,
  dtSeconds: number,
): number {
  if (prev === null) return next;
  const dt = Math.min(Math.max(dtSeconds, 0), PIPELINE.CLAMP_MAX_DT_S);
  const maxDelta = PIPELINE.MAX_ACCEL_MPS2 * dt;
  const delta = next - prev;
  if (delta > maxDelta) return prev + maxDelta;
  if (delta < -maxDelta) return prev - maxDelta;
  return next;
}
