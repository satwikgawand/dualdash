import { describe, expect, it } from 'vitest';
import { RollingMedian } from '../src/core/median';

describe('RollingMedian', () => {
  it('returns 0 when empty', () => {
    expect(new RollingMedian(5).value()).toBe(0);
  });

  it('kills a single-sample spike (median window behaviour)', () => {
    const m = new RollingMedian(5);
    [10, 10, 10, 40, 10].forEach((v) => m.push(v));
    // sorted: 10,10,10,10,40 -> median 10; the 40 spike is removed.
    expect(m.value()).toBe(10);
  });

  it('keeps an even window as the mean of the two middles', () => {
    const m = new RollingMedian(4);
    [10, 20, 30, 40].forEach((v) => m.push(v));
    // sorted: 10,20,30,40 -> (20+30)/2
    expect(m.value()).toBe(25);
  });

  it('slides the window (old samples drop off)', () => {
    const m = new RollingMedian(3);
    [100, 100, 100].forEach((v) => m.push(v));
    expect(m.value()).toBe(100);
    m.push(0);
    m.push(0);
    // window now 100,0,0 -> median 0
    expect(m.value()).toBe(0);
  });

  it('never exceeds the window size', () => {
    const m = new RollingMedian(5);
    for (let i = 0; i < 50; i++) m.push(i);
    expect(m.size()).toBe(5);
  });
});
