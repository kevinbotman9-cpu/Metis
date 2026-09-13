import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { cn } from '@/lib/cn';

/**
 * `cn` knows every size on the type scale.
 *
 * tailwind-merge reads an unknown `text-*` class as a colour. So a size token
 * that is in tailwind.config.js and not in `cn`'s font-size group is silently
 * dropped whenever a colour class follows it — and the other way round, a colour
 * is dropped when a size follows. Both have shipped: `text-body` once took
 * `text-white` off every primary button, and on 2026-09-13 `text-figure` rendered
 * the rail's figures at body size.
 *
 * The size names are read from the config, so the next token cannot be added to
 * one and forgotten in the other.
 */

const require = createRequire(import.meta.url);
const config = require(path.resolve(__dirname, '../../tailwind.config.js')) as {
  theme: { extend: { fontSize: Record<string, string> } };
};
const SIZES = Object.keys(config.theme.extend.fontSize);

describe('cn and the type scale', () => {
  it('reads the scale from the config, not from a list written here', () => {
    expect(SIZES).toEqual(expect.arrayContaining(['label', 'body', 'title', 'figure']));
  });

  for (const size of SIZES) {
    it(`keeps text-${size} beside a colour, and a colour beside it`, () => {
      const classes = cn(`tnum text-${size} font-semibold`, 'text-block').split(' ');
      expect(classes).toContain(`text-${size}`);
      expect(classes).toContain('text-block');

      const reversed = cn('text-content', `text-${size}`).split(' ');
      expect(reversed).toContain('text-content');
      expect(reversed).toContain(`text-${size}`);
    });

    it(`lets a later size replace text-${size}, as sizes should`, () => {
      const other = size === 'label' ? 'body' : 'label';
      expect(cn(`text-${size}`, `text-${other}`)).toBe(`text-${other}`);
    });
  }
});
