import { describe, it, expect } from 'vitest';
// @ts-expect-error — a plain .mjs module with no type declarations, deliberately
// dependency-free so it can also be run as a CLI while editing the palette.
import { check, parseTokens, ratio, over, describe as describePair } from '../scripts/check-contrast.mjs';

/**
 * The contrast ratios in the token layer, asserted rather than commented.
 *
 * `globals.css` records measurements in prose — "n-500 measured 4.29:1 on white",
 * "White measures 13.5:1 on the burgundy end". One of those is already stale:
 * the header band was recoloured from burgundy to teal and the comment survived
 * it. This is the difference between a number somebody once computed and a
 * number that is true.
 *
 * It runs at the root rather than in the console's own suite because it reads a
 * file and compares strings — the same reason `api-paths.test.ts` lives here.
 * It needs no browser, so it fails in a second rather than in the nine minutes
 * the axe sweep takes, and it names the token rather than the page.
 */

describe('the token layer clears WCAG AA', () => {
  it('resolves the tokens it claims to check', () => {
    // A guard on the guard. Most semantic tokens are `var(--n-N)` aliases, so a
    // parser that quietly failed to resolve them would report a confident green
    // over a handful of ramp steps and nothing else.
    const { light, dark } = parseTokens();
    for (const theme of [light, dark]) {
      expect(Object.keys(theme).length).toBeGreaterThan(40);
      for (const name of ['page', 'surface', 'surface-sunken', 'text', 'text-subtle', 'accent']) {
        expect(theme[name], `--${name} did not resolve`).toHaveLength(3);
      }
    }
    // The alias really was followed, not defaulted: --page is var(--n-100).
    expect(light.page).toEqual(light['n-100']);
    expect(light.text).toEqual(light['n-900']);
  });

  it('every documented pair holds in both themes', () => {
    const { results, failures } = check();
    expect(results.length).toBeGreaterThan(100);
    expect(
      failures.map((f: { measured: number | null; min: number }) =>
        `${describePair(f)} — ${f.measured === null ? 'missing token' : f.measured.toFixed(2)}, needs ${f.min}`
      )
    ).toEqual([]);
  });

  it('computes the ratios correctly', () => {
    // Two anchors from the spec itself: black on white is 21, and a colour on
    // itself is 1. An arithmetic slip that let a bad palette through would
    // most likely show up here first.
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(ratio([37, 99, 199], [37, 99, 199])).toBeCloseTo(1, 5);
    // And the value globals.css records for the current accent, so the file's
    // own claim is checked rather than trusted: "5.74 on surface".
    expect(ratio([13, 115, 102], [255, 255, 255])).toBeCloseTo(5.74, 1);
  });

  it('composites alpha rather than measuring the unblended colour', () => {
    // `text-on-header/80` renders as a blend. Checking the token alone would
    // pass while the rendered text failed, which is the whole reason the alpha
    // tier exists.
    expect(over([255, 255, 255], [0, 0, 0], 0.8)).toEqual([204, 204, 204]);
    expect(over([255, 255, 255], [0, 0, 0], 1)).toEqual([255, 255, 255]);
  });

  it('fails when a palette fails', () => {
    // The check has to be able to go red, or a green run means nothing. A
    // mid-grey text token on white is 3.9:1 — plausible enough that somebody
    // could type it, and short enough that it must not survive.
    const broken = parseTokens();
    broken.light['text-subtle'] = [130, 130, 130];
    const { failures } = check(broken);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((f: { theme: string }) => f.theme === 'light')).toBe(true);
    expect(failures.map((f: { fg: string }) => f.fg)).toContain('text-subtle');
  });

  it('treats a missing token as a broken assertion, not an absent one', () => {
    // Deleting a token should fail loudly. Skipping it is how a check stops
    // checking without anybody noticing.
    const broken = parseTokens();
    delete broken.light.accent;
    const { failures } = check(broken);
    expect(failures.some((f: { missing?: string }) => f.missing === 'accent')).toBe(true);
  });
});
