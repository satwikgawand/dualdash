// HUD windshield-mode guards (SPEC M2-O13, extended by M2-O14). HUD mode
// spends the viewport on two giant mirrored readouts — speed (hero) and
// heading (compass letter + degrees) — with near-zero chrome and no
// Drive-mode surface. M2-O14 rebalances the direction pair (smaller muted
// letter, bigger muted degrees) and fades the chrome out after 3 s with a
// tap to bring it back. These tests read the shipped sources plus the pure
// compass mapping and the pure auto-hide countdown (driven with fake
// timers), so a regression shows up in CI before a windshield ever sees it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { compassLetter } from '../src/components/HudMode';
import { CHROME_IDLE_MS, createChromeAutoHide } from '../src/components/hudChrome';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

const css = read('src/index.css');
const hudMode = read('src/components/HudMode.tsx');
const hudChrome = read('src/components/hudChrome.ts');
const toggleBar = read('src/components/ToggleBar.tsx');

/** The rule body for an exact selector, from the first `{` to its `}`. */
const rule = (src: string, selector: string): string => {
  const i = src.indexOf(selector);
  expect(i, `selector missing: ${selector}`).toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf('}', i) + 1);
};

/** The `min(Nvw, Ndvh)` terms of a clamp — the size order the M2-O13 law
 *  is stated in (width term first, height term second). */
const terms = (block: string): [number, number] => {
  const m = block.match(/min\((\d+)vw, (\d+)dvh\)/);
  expect(m, `no min() clamp in: ${block}`).not.toBeNull();
  return [Number(m![1]), Number(m![2])];
};

const portrait = css.slice(0, css.indexOf('@media (orientation: landscape)'));
const landscape = css.slice(css.indexOf('@media (orientation: landscape)'));

describe('M2-O13 compass letter (pure mapping)', () => {
  it('buckets the true-azimuth heading onto the 8-point rose', () => {
    expect(compassLetter(0)).toBe('N');
    expect(compassLetter(45)).toBe('NE');
    expect(compassLetter(90)).toBe('E');
    expect(compassLetter(135)).toBe('SE');
    expect(compassLetter(180)).toBe('S');
    expect(compassLetter(225)).toBe('SW');
    expect(compassLetter(270)).toBe('W');
    expect(compassLetter(315)).toBe('NW');
  });

  it('wraps at 360 without re-orienting the value (M2-O11 source is the law)', () => {
    expect(compassLetter(359)).toBe('N');
    expect(compassLetter(360)).toBe('N');
    expect(compassLetter(450)).toBe('E'); // 90 after the wrap
    expect(compassLetter(337)).toBe('NW'); // rounds to the 315 bucket
    expect(compassLetter(338)).toBe('N'); // rounds over the seam to 360 -> N
  });
});

describe('M2-O13 HUD supersize (src/index.css)', () => {
  it('the HUD speed is width-first and height-capped, bolder than Drive', () => {
    expect(css).toContain('.dd-hud .dd-readout {\n  font-size: clamp(4.75rem, min(44vw, 27dvh), 20rem);');
    expect(css).toMatch(/\.dd-hud \.dd-readout \{[^}]*font-weight: 700;/);
  });

  it('the heading letter and degrees carry their own giant clamps (M2-O14 rebalance)', () => {
    // REBASELINE (per-assertion, owner ask 2026-10-28): "make the direction
    // a bit smaller and the heading degree a bit bigger". Letter
    // 3.5rem/min(41vw,24dvh)/15rem -> 3rem/min(34vw,20dvh)/13rem (smaller
    // on both terms); degrees 1.25rem/min(7vw,5dvh)/2.75rem ->
    // 1.75rem/min(11vw,8dvh)/4.5rem (bigger on both terms, still under the
    // letter). The speed clamp is NOT touched — asserted below.
    expect(css).toContain('.dd-hud-heading-letter {\n  font-size: clamp(3rem, min(34vw, 20dvh), 13rem);');
    expect(css).toContain('.dd-hud-heading-deg {\n  font-size: clamp(1.75rem, min(11vw, 8dvh), 4.5rem);');
  });

  it('the letter stays under the hero speed so speed keeps the largest font', () => {
    const speed = css.match(/\.dd-hud \.dd-readout \{[^}]*min\((\d+)vw, (\d+)dvh\)/);
    const letter = css.match(/\.dd-hud-heading-letter \{[^}]*min\((\d+)vw, (\d+)dvh\)/);
    expect(speed).not.toBeNull();
    expect(letter).not.toBeNull();
    expect(Number(letter![1])).toBeLessThan(Number(speed![1])); // vw term
    expect(Number(letter![2])).toBeLessThan(Number(speed![2])); // dvh term
  });

  it('Drive mode keeps the exact M2-O7 clamp — HUD sizing never leaks', () => {
    expect(css).toContain('font-size: clamp(4.75rem, 33vw, 13rem);');
    expect(css).toMatch(/@media \(orientation: landscape\)[\s\S]*?\.dd-readout \{[^}]*min\(33vw, 32dvh\)/);
  });

  it('landscape puts the two heroes side by side, height-dominant', () => {
    const landscape = css.slice(css.indexOf('@media (orientation: landscape)'));
    expect(landscape).toMatch(/\.dd-hud \[data-testid='hud-mirror'\] \{\n    flex-direction: row;/);
    expect(landscape).toContain('.dd-hud .dd-readout {\n    font-size: clamp(4.5rem, min(34vw, 56dvh), 18rem);');
    // REBASELINE (per-assertion, M2-O14 rebalance): letter 3rem/min(26vw,
    // 40dvh)/13rem -> 2.5rem/min(20vw, 32dvh)/11rem (smaller), degrees
    // 1.1rem/min(5vw, 9dvh)/2.5rem -> 1.5rem/min(8vw, 14dvh)/4rem (bigger).
    // The landscape speed clamp above is byte-identical to M2-O13.
    expect(landscape).toContain('.dd-hud-heading-letter {\n    font-size: clamp(2.5rem, min(20vw, 32dvh), 11rem);');
    expect(landscape).toContain('.dd-hud-heading-deg {\n    font-size: clamp(1.5rem, min(8vw, 14dvh), 4rem);');
    // The landscape block stays layout-only (M2-O12 contract kept).
    expect(landscape).not.toMatch(/animation|transition|transform/);
  });
});

describe('M2-O13 HUD markup (chrome near-zero, data flow untouched)', () => {
  it('renders the giant compass letter + degrees from the app heading source', () => {
    expect(hudMode).toContain('data-testid="hud-heading-letter"');
    expect(hudMode).toContain('data-testid="hud-heading-deg"');
    // Same fields as before the rework: the M2-O11-normalized heading and
    // its suppression gate, never a re-oriented value.
    expect(hudMode).toContain('headingDeg={vm.m2.headingDeg}');
    expect(hudMode).toContain('suppressed={vm.m2.headingSuppressed}');
    expect(hudMode).toContain('state={vm.state}');
    expect(hudMode).toContain('unit={vm.unit}');
  });

  it('suppressed course shows placeholders, never a fake heading', () => {
    expect(hudMode).toContain("'\\u2014'"); // letter placeholder
    expect(hudMode).toContain("'--'"); // degrees placeholder
    expect(hudMode).toContain('data-suppressed=');
  });

  it('carries no Drive-mode surface: no tape, threshold, session or roll imports', () => {
    expect(hudMode).not.toMatch(/HeadingTape|ThresholdBar|SessionPanel|speedRoll/);
  });

  it('keeps the mirror around BOTH heroes (stack.md R4, M2-O11, M2-O13)', () => {
    expect(hudMode).toContain("style={{ transform: 'scaleX(-1)' }}");
    const mirror = hudMode.slice(hudMode.indexOf('data-testid="hud-mirror"'));
    const end = mirror.indexOf('</div>');
    const inside = mirror.slice(0, end);
    expect(inside).toContain('<SpeedReadout');
    expect(inside).toContain('<HudHeading');
  });

  it('chrome is one compact row: brand caption yields, both toggles stay', () => {
    expect(hudMode).toContain('<header className="flex items-center gap-2">');
    expect(hudMode).toContain('variant="unit"');
    expect(hudMode).toContain('variant="mode"');
    expect(css).toMatch(/\.dd-hud > header \.dd-micro \{\n  display: none;/);
    // The mode switch sheds padding but keeps a >= 44 px touch height and width.
    expect(css).toMatch(/\.dd-hud > header \[data-testid='mode-toggle'\] button \{[^}]*padding-left: 0\.75rem;/);
  });
});

describe('M2-O14 direction pair balance (smaller muted letter, bigger muted degrees)', () => {
  it('speed still outranks the WHOLE direction pair in both orientations', () => {
    // The M2-O13 law, extended to the degrees: speed > letter > degrees on
    // BOTH clamp terms (vw and dvh), portrait and landscape alike.
    for (const [label, src] of [
      ['portrait', portrait],
      ['landscape', landscape],
    ] as const) {
      const speed = terms(rule(src, '.dd-hud .dd-readout {'));
      const letter = terms(rule(src, '.dd-hud-heading-letter {'));
      const deg = terms(rule(src, '.dd-hud-heading-deg {'));
      expect(letter[0], `${label}: letter vw < speed vw`).toBeLessThan(speed[0]);
      expect(letter[1], `${label}: letter dvh < speed dvh`).toBeLessThan(speed[1]);
      expect(deg[0], `${label}: degrees vw < letter vw`).toBeLessThan(letter[0]);
      expect(deg[1], `${label}: degrees dvh < letter dvh`).toBeLessThan(letter[1]);
      expect(deg[0], `${label}: degrees vw < speed vw`).toBeLessThan(speed[0]);
      expect(deg[1], `${label}: degrees dvh < speed dvh`).toBeLessThan(speed[1]);
    }
  });

  it('both direction elements wear the app muted token', () => {
    // The muted/dim token of the app: --dd-text-3 (#8b8b96), declared for
    // micro-labels and ticks with >= 4.5:1 on --dd-bg (SPEC M2-O7).
    expect(css).toContain('--dd-text-3: #8b8b96;');
    expect(rule(css, '.dd-hud-heading-letter {')).toContain('color: var(--dd-text-3);');
    expect(rule(css, '.dd-hud-heading-deg {')).toContain('color: var(--dd-text-3);');
    // The colour lives on the pair's own rules, not on the wrapper — so no
    // state can repaint one half of the pair at full strength; the wrapper
    // only carries the M2-O4 suppression dim.
    const heading = hudMode.slice(
      hudMode.indexOf('function HudHeading'),
      hudMode.indexOf('export function HudMode'),
    );
    expect(heading).not.toContain('text-[var(--dd-text-');
    expect(heading).toContain('opacity-50');
  });
});

describe('M2-O14 chrome auto-hide (3 s idle, tap restore)', () => {
  const hiddenBody = (): string => {
    const i = css.indexOf(".dd-hud[data-chrome='hidden']");
    expect(i, 'hidden-state rule missing').toBeGreaterThanOrEqual(0);
    return css.slice(i, css.indexOf('}', i) + 1);
  };
  const visibleBody = (): string => rule(css, '.dd-hud > header,\n.dd-hud > .dd-hud-chrome {');

  it('HUD entry arms one 3 s countdown and a tap on the root re-arms it', () => {
    expect(CHROME_IDLE_MS).toBe(3000);
    expect(hudChrome).toContain('export const CHROME_IDLE_MS = 3000');
    expect(hudMode).toContain("import { createChromeAutoHide, type ChromeAutoHide } from './hudChrome';");
    expect(hudMode).toContain('createChromeAutoHide(setChromeHidden)');
    // The tap rides the ROOT — an ancestor of the mirrored container — as a
    // bubbling pointerdown: exactly one handler, no overlay element and no
    // propagation cut, so the same tap still reaches the heroes, a toggle
    // or a chip action, and each control's own onClick fires after it.
    expect(hudMode.match(/onPointerDown=/g)).toHaveLength(1);
    expect(hudMode).toContain('onPointerDown={() => autoHide.current?.poke()}');
    expect(hudMode).not.toMatch(/stopPropagation|preventDefault/);
    // Lifecycle: armed on mount, paused on backgrounding, disposed on
    // unmount (the effect cleanup removes the listener and the timer).
    expect(hudMode).toContain("document.addEventListener('visibilitychange', onVisibility)");
    expect(hudMode).toContain("document.removeEventListener('visibilitychange', onVisibility)");
    expect(hudMode).toContain('controller.dispose()');
  });

  it('only chrome rows hide — the heroes are never in the hidden set', () => {
    const body = hiddenBody();
    expect(body).toContain('> header');
    expect(body).toContain('> .dd-hud-chrome');
    // Those two hooks are all the rule can reach: no hero selector inside.
    expect(body).not.toMatch(/hud-mirror|hud-heading|speed|dd-readout|hero/);
    // And the hero markup carries neither hook; structure is header <
    // mirror (both heroes) < chip row, all direct children of the root.
    expect(hudMode).toMatch(/className="flex flex-1 flex-col items-center justify-center"/);
    expect(hudMode.match(/className="dd-hud-chrome/g)).toHaveLength(1); // chip row only
    expect(hudMode.indexOf('<header')).toBeLessThan(hudMode.indexOf('data-testid="hud-mirror"'));
    expect(hudMode.indexOf('data-testid="hud-mirror"')).toBeLessThan(
      hudMode.indexOf('className="dd-hud-chrome'),
    );
  });

  it('hides with an in-place fade only — no translate, no scale, no bounce', () => {
    const visible = visibleBody();
    expect(visible).toContain('transition:');
    expect(visible).toContain('opacity 240ms ease');
    expect(visible).not.toContain('pointer-events: none'); // visible chrome stays hit-testable
    const body = hiddenBody();
    expect(body).toContain('opacity: 0');
    expect(body).toContain('visibility: hidden');
    expect(body).not.toMatch(/transform|translate|scale|animation|keyframes|bounce/);
    // Reduced motion drops the fade (state still lands, instantly) — on
    // BOTH states: the hidden-state selector is repeated here so this rule
    // outranks the hidden rule's own transition.
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.dd-hud > header,[\s\S]*?\.dd-hud\[data-chrome='hidden'\] > \.dd-hud-chrome \{\s*transition: none;/,
    );
  });

  it('mode switch keeps its >=44 px target visible and is unreachable while hidden', () => {
    expect(toggleBar).toContain('min-h-11'); // 2.75rem = 44 px, both variants
    expect(toggleBar).toContain('min-w-16'); // compact unit switch width
    const body = hiddenBody();
    expect(body).toContain('pointer-events: none'); // hidden chrome cannot be hit
    expect(body).toContain('visibility: hidden'); // ...and leaves the a11y tree
  });

  it('chrome hides exactly 3 s after HUD entry — visible for the first 3 s', () => {
    vi.useFakeTimers();
    try {
      const seen: boolean[] = [];
      const chrome = createChromeAutoHide((h) => seen.push(h));
      expect(chrome.hidden()).toBe(false);
      vi.advanceTimersByTime(2999);
      expect(chrome.hidden()).toBe(false); // 3 s of readable chrome first
      vi.advanceTimersByTime(1);
      expect(chrome.hidden()).toBe(true);
      expect(seen).toEqual([true]);
      chrome.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a tap restores the chrome and restarts the countdown', () => {
    vi.useFakeTimers();
    try {
      const seen: boolean[] = [];
      const chrome = createChromeAutoHide((h) => seen.push(h));
      vi.advanceTimersByTime(3000);
      expect(chrome.hidden()).toBe(true);
      chrome.poke(); // the tap
      expect(chrome.hidden()).toBe(false);
      expect(seen).toEqual([true, false]);
      vi.advanceTimersByTime(2999);
      expect(chrome.hidden()).toBe(false); // full 3 s counted from the tap
      vi.advanceTimersByTime(1);
      expect(chrome.hidden()).toBe(true);
      // A tap while visible only restarts the countdown (tap = action + reset).
      chrome.poke();
      vi.advanceTimersByTime(2000);
      chrome.poke();
      vi.advanceTimersByTime(2999);
      expect(chrome.hidden()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(chrome.hidden()).toBe(true);
      chrome.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('backgrounding pauses the countdown; returning shows chrome with a fresh 3 s', () => {
    vi.useFakeTimers();
    try {
      const chrome = createChromeAutoHide(() => {});
      vi.advanceTimersByTime(1000);
      chrome.setVisible(false); // app backgrounded
      vi.advanceTimersByTime(10000);
      expect(chrome.hidden()).toBe(false); // no surprise hide while away
      chrome.setVisible(true); // foreground = fresh HUD entry
      expect(chrome.hidden()).toBe(false);
      vi.advanceTimersByTime(2999);
      expect(chrome.hidden()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(chrome.hidden()).toBe(true);
      // Coming back to an already-hidden HUD restores the chrome too.
      chrome.setVisible(false);
      chrome.setVisible(true);
      expect(chrome.hidden()).toBe(false);
      chrome.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('unmount disposes the countdown: no timer outlives the component', () => {
    vi.useFakeTimers();
    try {
      const seen: boolean[] = [];
      const chrome = createChromeAutoHide((h) => seen.push(h));
      vi.advanceTimersByTime(1500);
      chrome.dispose(); // the effect cleanup, mid-countdown
      vi.advanceTimersByTime(10000);
      expect(chrome.hidden()).toBe(false);
      expect(seen).toEqual([]); // never fired
      chrome.poke(); // inert after dispose
      chrome.setVisible(true);
      vi.advanceTimersByTime(10000);
      expect(seen).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
