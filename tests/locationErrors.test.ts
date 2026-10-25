// Permission-status and error-code mapping (SPEC M1-O7): the inputs to the
// chip state machine, table-driven. Nothing here may be swallowed or collapsed.

import { describe, expect, it } from 'vitest';
import {
  GLOC,
  effectsForErrorCode,
  permissionFromStatus,
  readNativeError,
} from '../src/platform/locationErrors';

describe('permissionFromStatus', () => {
  const cases: Array<{
    name: string;
    status: { location?: string | null; coarseLocation?: string | null };
    permission: string;
    precise: boolean;
  }> = [
    {
      name: 'both aliases granted = precise grant',
      status: { location: 'granted', coarseLocation: 'granted' },
      permission: 'granted',
      precise: true,
    },
    {
      name: 'approximate-only grant (Android 12+ "Approximate") still works',
      status: { location: 'denied', coarseLocation: 'granted' },
      permission: 'granted',
      precise: false,
    },
    {
      name: 'never asked = prompt',
      status: { location: 'prompt', coarseLocation: 'prompt' },
      permission: 'prompt',
      precise: false,
    },
    {
      name: 'prompt-with-rationale (iOS/web shape) = prompt',
      status: { location: 'prompt-with-rationale', coarseLocation: 'prompt' },
      permission: 'prompt',
      precise: false,
    },
    {
      name: 'both refused = denied',
      status: { location: 'denied', coarseLocation: 'denied' },
      permission: 'denied',
      precise: false,
    },
    {
      name: 'no status at all = unknown',
      status: {},
      permission: 'unknown',
      precise: false,
    },
    {
      name: 'coarse only in the response, denied fine = granted approximate',
      status: { location: null, coarseLocation: 'granted' },
      permission: 'granted',
      precise: false,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const read = permissionFromStatus(c.status);
      expect(read.permission).toBe(c.permission);
      expect(read.precise).toBe(c.precise);
    });
  }
});

describe('effectsForErrorCode', () => {
  const cases: Array<{
    code: string | null;
    name: string;
    permission?: string;
    providerEnabled?: boolean;
    empty?: boolean;
  }> = [
    { code: GLOC.PERMISSION_DENIED, name: 'permission denied proves denial', permission: 'denied' },
    { code: GLOC.LOCATION_DISABLED, name: 'services off proves provider off', providerEnabled: false },
    { code: GLOC.ENABLE_REQUEST_DENIED, name: 'enable-request refused = provider off', providerEnabled: false },
    { code: GLOC.NETWORK_LOCATION_DISABLED, name: 'network + location off = provider off', providerEnabled: false },
    { code: GLOC.TIMEOUT, name: 'first-fix timeout proves nothing else', empty: true },
    { code: GLOC.POSITION_UNAVAILABLE, name: 'generic unavailable proves nothing else', empty: true },
    { code: GLOC.MANIFEST_PERMISSIONS_MISSING, name: 'manifest missing recorded only', empty: true },
    { code: GLOC.GOOGLE_SERVICES_ERROR, name: 'play services error recorded only', empty: true },
    { code: null, name: 'no code proves nothing', empty: true },
    { code: 'SOMETHING-ELSE', name: 'unknown code proves nothing', empty: true },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const effects = effectsForErrorCode(c.code);
      if (c.empty) {
        expect(effects).toEqual({});
      } else {
        if (c.permission !== undefined) expect(effects.permission).toBe(c.permission);
        if (c.providerEnabled !== undefined) expect(effects.providerEnabled).toBe(c.providerEnabled);
      }
    });
  }
});

describe('readNativeError', () => {
  it('reads code + message from a Capacitor reject', () => {
    const read = readNativeError({
      code: GLOC.TIMEOUT,
      message: 'Could not obtain location in time. Try with a higher timeout.',
    });
    expect(read.code).toBe(GLOC.TIMEOUT);
    expect(read.message).toContain('higher timeout');
  });

  it('keeps a plain Error message with no code', () => {
    const read = readNativeError(new Error('Location permission denied'));
    expect(read.code).toBeNull();
    expect(read.message).toBe('Location permission denied');
  });

  it('keeps a thrown string', () => {
    expect(readNativeError('boom')).toEqual({ code: null, message: 'boom' });
  });

  it('handles null', () => {
    expect(readNativeError(null)).toEqual({ code: null, message: 'null' });
  });
});
