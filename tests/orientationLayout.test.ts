// Orientation layout guards (SPEC M2-O12). Landscape support must not move
// the portrait layout, and it must keep the M1-O6 inset contract on all four
// sides. These tests read the shipped sources, so a regression shows up in
// CI before a device ever sees it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

const manifest = read('android/app/src/main/AndroidManifest.xml');
const css = read('src/index.css');
const driveMode = read('src/components/DriveMode.tsx');
const hudMode = read('src/components/HudMode.tsx');
const readout = read('src/components/readout.tsx');
const threshold = read('src/components/ThresholdBar.tsx');

describe('M2-O12 orientation unlock (Android manifest)', () => {
  it('requests fullSensor, the four-orientation sensor value', () => {
    expect(manifest).toContain('android:screenOrientation="fullSensor"');
  });

  it('no longer locks the activity to portrait', () => {
    expect(manifest).not.toMatch(/android:screenOrientation="portrait"/);
  });

  // configChanges is what keeps the WebView (and the GPS watch) alive on a
  // rotate: the activity is not destroyed, so no JS teardown happens.
  it('keeps orientation|screenSize in configChanges so a rotate does not restart the activity',
    () => {
      const activity = manifest.slice(manifest.indexOf('<activity'), manifest.indexOf('</activity>'));
      expect(activity).toContain('android:configChanges="orientation|keyboardHidden|keyboard|screenSize');
      expect(activity).toContain('smallestScreenSize');
    });
});

describe('M2-O12 safe-area insets (src/index.css)', () => {
  const rootRule = css.slice(css.indexOf('#root > div {'), css.indexOf('}', css.indexOf('#root > div {')));

  it('pads the top and bottom axes (M1-O6, unchanged)', () => {
    expect(rootRule).toContain('padding-top: calc(1rem + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))');
    expect(rootRule).toContain('padding-bottom: calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))');
  });

  // Landscape turns the cutout and the gesture edge 90 degrees.
  it('pads the left and right axes from the same variables', () => {
    expect(rootRule).toContain('padding-left: calc(1rem + var(--safe-area-inset-left, env(safe-area-inset-left, 0px)))');
    expect(rootRule).toContain('padding-right: calc(1rem + var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))');
  });

  it('keeps the 1rem base, so a flat screen keeps the M1-O6 margins', () => {
    expect(rootRule.match(/calc\(1rem \+/g)).toHaveLength(4);
  });
});

describe('M2-O12 readout sizing', () => {
  it('portrait keeps the exact M2-O7 clamp', () => {
    expect(css).toContain('.dd-readout {\n  font-size: clamp(4.75rem, 33vw, 13rem);\n}');
  });

  it('landscape clamps by height as well as width', () => {
    expect(css).toMatch(/@media \(orientation: landscape\) \{[\s\S]*?\.dd-readout \{[\s\S]*?min\(33vw, 32dvh\)/);
  });

  it('the readout carries the class, not an inline style', () => {
    expect(readout).toContain('dd-readout font-semibold tabular-nums leading-none tracking-tight');
    expect(readout).not.toContain('clamp(4.75rem, 33vw, 13rem)');
  });
});

describe('M2-O12 landscape layout rules', () => {
  const landscape = css.slice(css.indexOf('@media (orientation: landscape)'));

  it('drive mode becomes the four-row landscape grid', () => {
    expect(landscape).toContain(".dd-drive {");
    expect(landscape).toContain("'head chips'");
    expect(landscape).toContain("'tape tape'");
    expect(landscape).toContain("'main main'");
    expect(landscape).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto');
  });

  it('the tape spans the full width and the chips join the header row', () => {
    expect(landscape).toMatch(/\.dd-drive > \[data-testid='heading-tape'\] \{\n    grid-area: tape;/);
    expect(landscape).toMatch(/\.dd-drive > \[data-testid='status-chips'\] \{\n    grid-area: chips;/);
  });

  it('hud mode only folds its header and tucks the arrow', () => {
    expect(landscape).toContain('.dd-hud > header {');
    expect(landscape).toContain(".dd-hud [data-testid='hud-heading'] {");
  });

  it('is layout only: no animation or transition lives in the block', () => {
    expect(landscape).not.toMatch(/animation|transition|transform/);
  });

  it('drive root carries the dd-drive hook and hud root the dd-hud hook', () => {
    expect(driveMode).toContain('className="dd-drive flex min-h-dvh w-full flex-col gap-3 px-4 pb-4');
    expect(hudMode).toContain('className="dd-hud flex min-h-dvh w-full flex-col gap-3 bg-black px-4 pb-4"');
  });
});

describe('M2-O12 unchanged contracts', () => {
  it('HUD keeps its mirror transform (SPEC stack.md R4, M2-O11)', () => {
    expect(hudMode).toContain("style={{ transform: 'scaleX(-1)' }}");
    expect(hudMode).toContain('data-testid="hud-mirror"');
  });

  // The threshold line moves beside the controls in landscape (M2-O12), so
  // its DOM order must stay: line first, session panel second.
  it('drive mode keeps the line above the session panel, inside the controls column', () => {
    const controls = driveMode.slice(driveMode.indexOf('dd-drive-controls'));
    expect(controls.indexOf('threshold-bar')).toBeLessThan(controls.indexOf('<SessionPanel'));
  });

  it('landscape drops only the "set from" hint; the line and over labels stay', () => {
    expect(threshold).toContain('landscape:hidden');
    expect(threshold).toContain('set from');
    expect(threshold).toContain('over ${limitText}');
    expect(threshold).toContain('line ${limitText}');
  });

  it('prefers-reduced-motion still strips the tape follow', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.dd-tape-track \{[\s\S]*?transition: none !important/);
  });
});
