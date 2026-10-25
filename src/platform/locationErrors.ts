// Error-code map for @capacitor/geolocation (SPEC M1-O7). Every native error
// is recorded and mapped to a state effect; nothing is swallowed.
//
// Codes: Capacitor Geolocation "Errors" table
// (https://capacitorjs.com/docs/apis/geolocation) and
// node_modules/@capacitor/geolocation/android/.../GeolocationErrors.kt.
//
// Pure module: no Capacitor import, so it is unit-testable in Node.

import type { LocationPermissionState } from './SpeedSource';

/** Native plugin error codes DualDash can receive. */
export const GLOC = {
  /** Generic failure to obtain a location (also the watch's fallback branch). */
  POSITION_UNAVAILABLE: 'OS-PLUG-GLOC-0002',
  /** Location permission request was denied. */
  PERMISSION_DENIED: 'OS-PLUG-GLOC-0003',
  /** Location services (quick settings) are off — thrown by check/requestPermissions. */
  LOCATION_DISABLED: 'OS-PLUG-GLOC-0007',
  /** The user declined the plugin's "enable location" settings dialog. */
  ENABLE_REQUEST_DENIED: 'OS-PLUG-GLOC-0009',
  /** No location within `timeout` ms — the first-emission watchdog. */
  TIMEOUT: 'OS-PLUG-GLOC-0010',
  /** `timeout` was not a positive value. */
  INVALID_TIMEOUT: 'OS-PLUG-GLOC-0011',
  /** Google Play Services error, user-resolvable. */
  GOOGLE_SERVICES_RESOLVABLE: 'OS-PLUG-GLOC-0014',
  /** Google Play Services error. */
  GOOGLE_SERVICES_ERROR: 'OS-PLUG-GLOC-0015',
  /** Location settings error. */
  SETTINGS_ERROR: 'OS-PLUG-GLOC-0016',
  /** Both network location and device location are off. */
  NETWORK_LOCATION_DISABLED: 'OS-PLUG-GLOC-0017',
  /** Location permissions are missing from the Android manifest (fatal). */
  MANIFEST_PERMISSIONS_MISSING: 'OS-PLUG-GLOC-0018',
} as const;

/** State side effects implied by an error code. */
export interface ErrorEffects {
  /** Overrides the known permission state when the code says so. */
  permission?: LocationPermissionState;
  /** Overrides the known provider state when the code says so. */
  providerEnabled?: boolean;
}

/**
 * Map a plugin error code to the state it proves.
 * Codes that prove nothing (timeouts, generic unavailability, Play Services)
 * return {} — they are still recorded in diagnostics, just not mapped.
 */
export function effectsForErrorCode(code: string | null | undefined): ErrorEffects {
  switch (code) {
    case GLOC.PERMISSION_DENIED:
      return { permission: 'denied' };
    case GLOC.LOCATION_DISABLED:
    case GLOC.ENABLE_REQUEST_DENIED:
    case GLOC.NETWORK_LOCATION_DISABLED:
      return { providerEnabled: false };
    default:
      return {};
  }
}

/** Subset of the plugin's PermissionStatus the mapping needs. */
export interface PermissionStatusLike {
  location?: string | null;
  coarseLocation?: string | null;
}

export interface PermissionRead {
  permission: LocationPermissionState;
  precise: boolean;
}

/**
 * Read the plugin's permission status.
 *
 * On Android 12+ the system can grant approximate (coarse) location only.
 * That is a working grant for this app, so coarse alone maps to 'granted'
 * with precise=false — it must NOT be read as a denial.
 */
export function permissionFromStatus(status: PermissionStatusLike): PermissionRead {
  const location = (status.location ?? '').toLowerCase();
  const coarse = (status.coarseLocation ?? '').toLowerCase();
  const asked = ['prompt', 'prompt-with-rationale'];

  if (location === '' && coarse === '') return { permission: 'unknown', precise: false };
  if (location === 'granted') return { permission: 'granted', precise: true };
  if (coarse === 'granted') return { permission: 'granted', precise: false };
  if (asked.includes(location) || asked.includes(coarse)) {
    return { permission: 'prompt', precise: false };
  }
  return { permission: 'denied', precise: false };
}

export interface NativeErrorRead {
  code: string | null;
  message: string;
}

/**
 * Normalise anything thrown by the plugin (Capacitor rejects carry `code` and
 * `message`; plain Errors and strings carry neither).
 */
export function readNativeError(e: unknown): NativeErrorRead {
  if (typeof e === 'string') return { code: null, message: e };
  if (e !== null && typeof e === 'object') {
    const rec = e as { code?: unknown; message?: unknown };
    const code = typeof rec.code === 'string' && rec.code !== '' ? rec.code : null;
    const message =
      typeof rec.message === 'string' && rec.message !== '' ? rec.message : String(e);
    return { code, message };
  }
  return { code: null, message: String(e) };
}
