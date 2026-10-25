// Table-driven state mapping for the location chip (SPEC M1-O7).
//
// Every row is one chain state the device can be in:
//   permission x provider x watch x last error x fix age -> chip state.
// The four driver-facing states (LOCATION NEEDED / LOCATION DENIED /
// LOCATION OFF / SEARCHING / SIGNAL LOST) each get at least one row, plus the
// healthy NONE row. src/core is not touched by this mapping.

import { describe, expect, it } from 'vitest';
import { ChipInput, ChipView, chipFor, formatAge } from '../src/state/locationChip';
import { GLOC } from '../src/platform/locationErrors';

interface Row {
  name: string;
  input: ChipInput;
  state: ChipView['state'];
  labelIncludes?: string;
  hintIncludes?: string;
  action?: ChipView['action'];
}

/** Healthy base every row starts from unless it overrides the field. */
const base: ChipInput = {
  permission: 'granted',
  providerEnabled: true,
  watchActive: true,
  lastErrorCode: null,
  fixState: 'LOST',
  fixAgeMs: null,
};

const rows: Row[] = [
  // --- permission states -------------------------------------------------
  {
    name: 'permission never answered -> LOCATION NEEDED with [Allow]',
    input: { ...base, permission: 'prompt', fixState: 'LIVE', fixAgeMs: 400 },
    state: 'LOCATION_NEEDED',
    labelIncludes: 'LOCATION NEEDED',
    hintIncludes: 'Grant location',
    action: 'allow',
  },
  {
    name: 'permission not read yet -> LOCATION NEEDED with [Allow]',
    input: { ...base, permission: 'unknown', fixState: 'LIVE', fixAgeMs: 400 },
    state: 'LOCATION_NEEDED',
    labelIncludes: 'LOCATION NEEDED',
    action: 'allow',
  },
  {
    name: 'permission denied -> LOCATION DENIED with [Retry] + instructions',
    input: { ...base, permission: 'denied', fixState: 'LOST', fixAgeMs: null },
    state: 'LOCATION_DENIED',
    labelIncludes: 'LOCATION DENIED',
    hintIncludes: 'Android Settings',
    action: 'retry',
  },
  {
    name: 'permission denied beats provider-off (fix permission first)',
    input: { ...base, permission: 'denied', providerEnabled: false },
    state: 'LOCATION_DENIED',
  },

  // --- provider states ---------------------------------------------------
  {
    name: 'services off -> LOCATION OFF with quick-settings hint',
    input: { ...base, providerEnabled: false, fixState: 'LOST', fixAgeMs: 90_000 },
    state: 'LOCATION_OFF',
    labelIncludes: 'LOCATION OFF',
    hintIncludes: 'quick-settings',
    action: 'recheck',
  },
  {
    name: 'services off while permission still pending -> LOCATION OFF first',
    input: { ...base, permission: 'prompt', providerEnabled: false },
    state: 'LOCATION_OFF',
    action: 'recheck',
  },
  {
    name: 'error OS-PLUG-GLOC-0007 proves provider off when never checked',
    input: {
      ...base,
      permission: 'granted',
      providerEnabled: null,
      lastErrorCode: GLOC.LOCATION_DISABLED,
      fixState: 'LOST',
      fixAgeMs: null,
    },
    state: 'LOCATION_OFF',
    action: 'recheck',
  },
  {
    name: 'error OS-PLUG-GLOC-0017 (network + location off) -> LOCATION OFF',
    input: {
      ...base,
      permission: 'granted',
      providerEnabled: null,
      lastErrorCode: GLOC.NETWORK_LOCATION_DISABLED,
      fixState: 'LOST',
      fixAgeMs: null,
    },
    state: 'LOCATION_OFF',
  },
  {
    name: 'stale provider error cannot mask a provider that came back on',
    input: {
      ...base,
      providerEnabled: true,
      lastErrorCode: GLOC.LOCATION_DISABLED,
      fixState: 'LIVE',
      fixAgeMs: 300,
    },
    state: 'NONE',
  },

  // --- error codes fill unknown permission --------------------------------
  {
    name: 'error OS-PLUG-GLOC-0003 proves denial when permission unknown',
    input: {
      ...base,
      permission: 'unknown',
      lastErrorCode: GLOC.PERMISSION_DENIED,
      fixState: 'LOST',
      fixAgeMs: null,
    },
    state: 'LOCATION_DENIED',
    action: 'retry',
  },
  {
    name: 'permission denied recorded from the watch callback too',
    input: {
      ...base,
      permission: 'denied',
      lastErrorCode: GLOC.PERMISSION_DENIED,
      fixState: 'LOST',
      fixAgeMs: null,
    },
    state: 'LOCATION_DENIED',
  },

  // --- SEARCHING (watching, no fix yet) -----------------------------------
  {
    name: 'healthy chain, no fix yet -> SEARCHING while the watch runs',
    input: { ...base, watchActive: true, fixState: 'LOST', fixAgeMs: null },
    state: 'SEARCHING',
    labelIncludes: 'SEARCHING',
    hintIncludes: 'watching',
  },
  {
    name: 'watch still starting -> SEARCHING says so instead of dying',
    input: { ...base, watchActive: false, fixState: 'LOST', fixAgeMs: null },
    state: 'SEARCHING',
    labelIncludes: 'SEARCHING',
    hintIncludes: 'starting watch',
  },
  {
    name: 'first-fix timeout error is visible, chain still SEARCHING',
    input: {
      ...base,
      watchActive: true,
      lastErrorCode: GLOC.TIMEOUT,
      fixState: 'LOST',
      fixAgeMs: null,
    },
    state: 'SEARCHING',
    hintIncludes: GLOC.TIMEOUT,
  },
  {
    name: 'permission granted but only approximate still SEARCHES (no false denial)',
    input: {
      ...base,
      permission: 'granted',
      providerEnabled: true,
      watchActive: true,
      fixState: 'LOST',
      fixAgeMs: null,
    },
    state: 'SEARCHING',
    hintIncludes: 'watching',
  },

  // --- SIGNAL LOST with the real fix age ----------------------------------
  {
    name: 'fresh fix -> no chip at all',
    input: { ...base, fixState: 'LIVE', fixAgeMs: 400 },
    state: 'NONE',
  },
  {
    name: 'STALE fix (3-10 s) -> SIGNAL LOST with age',
    input: { ...base, fixState: 'STALE', fixAgeMs: 5_400 },
    state: 'SIGNAL_LOST',
    labelIncludes: 'SIGNAL LOST — last fix 5 s',
  },
  {
    name: 'LOST fix (>10 s) -> SIGNAL LOST with age',
    input: { ...base, fixState: 'LOST', fixAgeMs: 25_400 },
    state: 'SIGNAL_LOST',
    labelIncludes: 'SIGNAL LOST — last fix 25 s',
  },
  {
    name: 'age is reported in minutes past a minute',
    input: { ...base, fixState: 'LOST', fixAgeMs: 125_000 },
    state: 'SIGNAL_LOST',
    labelIncludes: 'SIGNAL LOST — last fix 2 m',
  },
  {
    name: 'LIVE fix with permission withdrawn still reports LOCATION NEEDED',
    input: { ...base, permission: 'prompt', fixState: 'LIVE', fixAgeMs: 200 },
    state: 'LOCATION_NEEDED',
  },
];

describe('chipFor: permission x provider x watch x error x fix age -> chip', () => {
  for (const row of rows) {
    it(row.name, () => {
      const view = chipFor(row.input);
      expect(view.state).toBe(row.state);
      if (row.labelIncludes !== undefined) {
        expect(view.label ?? '').toContain(row.labelIncludes);
      }
      if (row.hintIncludes !== undefined) {
        expect(view.hint ?? '').toContain(row.hintIncludes);
      }
      if (row.action !== undefined) expect(view.action).toBe(row.action);
    });
  }

  it('covers every chip state at least once', () => {
    const seen = new Set(rows.map((r) => chipFor(r.input).state));
    for (const state of [
      'LOCATION_NEEDED',
      'LOCATION_DENIED',
      'LOCATION_OFF',
      'SEARCHING',
      'SIGNAL_LOST',
      'NONE',
    ]) {
      expect(seen.has(state as ChipView['state'])).toBe(true);
    }
  });

  it('never invents a label for the healthy state', () => {
    const view = chipFor({ ...base, fixState: 'LIVE', fixAgeMs: 900 });
    expect(view.label).toBeNull();
    expect(view.hint).toBeNull();
    expect(view.action).toBeNull();
  });

  it('SIGNAL LOST never renders 0-age or a fake age', () => {
    const view = chipFor({ ...base, fixState: 'LOST', fixAgeMs: 0 });
    expect(view.state).toBe('SIGNAL_LOST');
    expect(view.label).toContain('<1 s');
  });
});

describe('formatAge', () => {
  const cases: Array<[number, string]> = [
    [0, '<1 s'],
    [999, '<1 s'],
    [1_000, '1 s'],
    [12_400, '12 s'],
    [59_400, '59 s'],
    [60_000, '1 m'],
    [245_000, '4 m'],
    [Number.NaN, '<1 s'],
  ];
  for (const [ms, expected] of cases) {
    it(`${ms} ms -> ${expected}`, () => {
      expect(formatAge(ms)).toBe(expected);
    });
  }
});
