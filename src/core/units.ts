// Unit conversion (pure).
export const MPS_TO_KMH = 3.6;
export const MPS_TO_MPH = 2.2369362920544;

export type Unit = 'kmh' | 'mph';

export function mpsToKmh(mps: number): number {
  return mps * MPS_TO_KMH;
}

export function mpsToMph(mps: number): number {
  return mps * MPS_TO_MPH;
}

export function convert(mps: number, unit: Unit): number {
  return unit === 'kmh' ? mpsToKmh(mps) : mpsToMph(mps);
}

export function unitLabel(unit: Unit): string {
  return unit === 'kmh' ? 'km/h' : 'mph';
}

/** Compass label from a true-course in degrees; NaN yields "". */
export function compassLabel(headingDeg: number | null): string {
  if (headingDeg === null || !Number.isFinite(headingDeg)) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((headingDeg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}
