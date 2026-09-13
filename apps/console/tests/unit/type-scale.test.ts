import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { typeOffenders } from '../type-scale';

/**
 * Type is set on the scale, and only on it. `docs/METIS_CONSOLE_SPEC.md` Part 5.
 *
 * The sweep on 2026-09-13 found 126 sites outside it; this is what stops the
 * 127th. The rules and their reasons are in `tests/type-scale.ts`.
 */

const ROOT = path.resolve(__dirname, '../..');

describe('type is set on the scale', () => {
  it('is looking at the console, not an empty directory', () => {
    // Without this, a moved app directory would make the next assertion pass by
    // scanning nothing.
    expect(fs.existsSync(path.join(ROOT, 'components/ui/primitives.tsx'))).toBe(true);
  });

  it('sets no size, line height, weight or family outside it', () => {
    const offenders = typeOffenders(ROOT).map((o) => `${o.file}:${o.line}  ${o.rule}  —  ${o.text.slice(0, 90)}`);
    expect(offenders, 'use the type tokens; the scale is in METIS_CONSOLE_SPEC.md Part 5').toEqual([]);
  });

  it('keeps the tokens the scale names, both densities', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    for (const token of ['--text-label', '--text-body', '--text-title', '--text-figure']) {
      // Declared once for comfortable and once for compact, or density stops
      // reaching that size.
      expect(css.match(new RegExp(`${token}:`, 'g'))?.length ?? 0, `${token} in both density blocks`).toBe(2);
    }
  });
});
