import { describe, expect, it } from 'vitest';
import { fixStateForAge, showNoFixFor } from '../src/core/fixState';
import { PIPELINE } from '../src/core/types';

describe('fix-age state machine (LIVE / STALE / LOST)', () => {
  it('LIVE at age 0', () => {
    expect(fixStateForAge(0)).toBe('LIVE');
  });

  it('LIVE at the 3 s boundary (inclusive)', () => {
    expect(fixStateForAge(PIPELINE.LIVE_MAX_AGE_MS)).toBe('LIVE');
  });

  it('STALE just past 3 s', () => {
    expect(fixStateForAge(PIPELINE.LIVE_MAX_AGE_MS + 1)).toBe('STALE');
  });

  it('STALE at the 10 s boundary (inclusive)', () => {
    expect(fixStateForAge(PIPELINE.STALE_MAX_AGE_MS)).toBe('STALE');
  });

  it('LOST past 10 s', () => {
    expect(fixStateForAge(PIPELINE.STALE_MAX_AGE_MS + 1)).toBe('LOST');
  });

  it('LOST when there has never been a fix (null age)', () => {
    expect(fixStateForAge(null)).toBe('LOST');
  });

  it('LOST on non-finite age', () => {
    expect(fixStateForAge(Number.POSITIVE_INFINITY)).toBe('LOST');
  });

  it('shows NO FIX for STALE and LOST only', () => {
    expect(showNoFixFor('LIVE')).toBe(false);
    expect(showNoFixFor('STALE')).toBe(true);
    expect(showNoFixFor('LOST')).toBe(true);
  });
});
