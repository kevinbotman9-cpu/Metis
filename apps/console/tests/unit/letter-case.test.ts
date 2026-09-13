import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caseOffenders } from '../letter-case';

/**
 * Sentence case throughout, `docs/METIS_CONSOLE_SPEC.md` Part 5. The reasons are
 * in `tests/letter-case.ts`.
 */

const ROOT = path.resolve(__dirname, '../..');

/** A throwaway console root holding one file, so each rule is shown to fire and to hold back. */
function scan(file: string, source: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'letter-case-'));
  const full = path.join(root, 'components', file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, source);
  try {
    return caseOffenders(root).map((o) => o.text);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('sentence case throughout', () => {
  it('is looking at the console, not an empty directory', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/ui/primitives.tsx'))).toBe(true);
  });

  it('has no all-caps or tracked-out label', () => {
    const offenders = caseOffenders(ROOT).map((o) => `${o.file}:${o.line}  ${o.rule}  —  ${o.text.slice(0, 90)}`);
    expect(offenders, 'write it in sentence case; METIS_CONSOLE_SPEC.md Part 5').toEqual([]);
  });

  it('flags an all-caps class and widened tracking wherever they sit in a class list', () => {
    expect(
      scan(
        'a.tsx',
        [
          '<p className="uppercase text-label">A</p>',
          '<p className="text-label uppercase">B</p>',
          "cn('text-label', 'tracking-wide')",
          '<span className="tracking-[0.08em]">C</span>',
          "<p style={{ textTransform: 'uppercase' }}>D</p>",
        ].join('\r\n')
      )
    ).toHaveLength(5);
    // Two declarations on one line are two findings, not one.
    expect(scan('b.css', '.eyebrow { letter-spacing: 0.08em; text-transform: uppercase; }')).toHaveLength(2);
  });

  it('leaves alone what the spec does not forbid', () => {
    expect(
      scan(
        'c.tsx',
        [
          '<h1 className="text-title font-semibold tracking-tight">Title</h1>',
          '<p className="tracking-[-0.02em] normal-case">42</p>',
          '<option value="uppercase">uppercase</option>',
          "const transforms = ['trim', 'uppercase'];",
        ].join('\n')
      )
    ).toEqual([]);
  });
});
