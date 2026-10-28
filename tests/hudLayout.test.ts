// HUD windshield-mode guards (SPEC M2-O13). HUD mode spends the viewport on
// two giant mirrored readouts — speed (hero) and heading (compass letter +
// degrees) — with near-zero chrome and no Drive-mode surface. These tests
// read the shipped sources plus the pure compass mapping, so a regression
// shows up in CI before a windshield ever sees it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compassLetter } from '../src/components/HudMode';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

const css = read('src/index.css');
const hudMode = read('src/components/HudMode.tsx');

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

  it('the heading letter and degrees carry their own giant clamps', () => {
    expect(css).toContain('.dd-hud-heading-letter {\n  font-size: clamp(3.5rem, min(41vw, 24dvh), 15rem);');
    expect(css).toContain('.dd-hud-heading-deg {\n  font-size: clamp(1.25rem, min(7vw, 5dvh), 2.75rem);');
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
    expect(landscape).toContain('.dd-hud-heading-letter {\n    font-size: clamp(3rem, min(26vw, 40dvh), 13rem);');
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
