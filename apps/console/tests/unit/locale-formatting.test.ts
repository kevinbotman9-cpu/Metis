import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The console formats dates, numbers and money in one place. G-092.
 *
 * Until 2026-09-13, `'en-GB'` was written at 77 call sites across 36 files and
 * four files carried their own `GBP ? '£' : USD ? '$' : '€'` map. Replacing those
 * with the tenant formatter fixes the tenant that exists; this is what stops
 * the seventy-eighth call site, which is the one that would have come back the
 * first time somebody needed a date in a hurry.
 *
 * Source is scanned with comments removed, so prose that explains the history
 * — this file, `lib/format.ts` — does not trip it.
 */

const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components', 'lib'];
/** The one file allowed to call the platform formatters. */
const FORMATTER = 'lib/format.ts';

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.(stories|test)\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const d of DIRS) walk(path.join(ROOT, d));
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');
const code = (f: string) =>
  fs
    .readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const FILES = sourceFiles();

/** Every line in source (comments removed) that matches, as `file:line  text`. */
function offenders(pattern: RegExp, except: readonly string[] = []): string[] {
  const found: string[] = [];
  for (const f of FILES) {
    if (except.includes(rel(f))) continue;
    code(f)
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line)) found.push(`${rel(f)}:${i + 1}  ${line.trim()}`);
      });
  }
  return found;
}

const PLATFORM_FORMATTING = /\.toLocale(Date|Time)?String\(|Intl\.(NumberFormat|DateTimeFormat)\(/;

describe('the console formats in the tenant’s locale, and only one way', () => {
  it('is looking at the console, not an empty directory', () => {
    // Without this, a moved app directory would make every assertion below pass
    // by scanning nothing.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.map(rel)).toContain(FORMATTER);
    expect(PLATFORM_FORMATTING.test(code(path.join(ROOT, FORMATTER)))).toBe(true);
  });

  it('calls the platform formatters nowhere but lib/format.ts', () => {
    expect(
      offenders(PLATFORM_FORMATTING, [FORMATTER]),
      'format through useFormat() — the locale is the tenant’s, not the call site’s'
    ).toEqual([]);
  });

  it('names no locale in source', () => {
    expect(offenders(/['"`][a-z]{2}-[A-Z]{2}['"`]/), 'a locale belongs in the tenant’s settings').toEqual([]);
  });

  it('draws no currency symbol by hand', () => {
    expect(offenders(/['"`][£€]['"`]|['"`]\$['"`]/), 'an amount is formatted by format.money, which knows the symbol').toEqual([]);
  });
});
