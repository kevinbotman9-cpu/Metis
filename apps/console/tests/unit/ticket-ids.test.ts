import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { idsIn, ticketIdOffenders } from '../ticket-ids';

/**
 * No backlog, gap or ADR id in text a person reads on screen. The reasons are in
 * `tests/ticket-ids.ts`.
 */

const ROOT = path.resolve(__dirname, '../..');

describe('screen text carries no ticket or ADR id', () => {
  it('is looking at the console, not an empty directory', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/ui/primitives.tsx'))).toBe(true);
  });

  it('finds none under app/ and components/', () => {
    const offenders = ticketIdOffenders(ROOT).map((o) => `${o.file}:${o.line}  ${o.id}  —  ${o.text.slice(0, 90)}`);
    expect(offenders, 'say the reason on screen; the id belongs in docs/gaps.md or docs/BACKLOG.md').toEqual([]);
  });

  it('reads an id in a string or in JSX text, and not one in a comment', () => {
    const src = [
      '// W-017 in a line comment',
      '/* ADR-013 in a block',
      '   comment across lines, G-001 */',
      '{/* G-101 in a JSX comment */}',
      "const a = 'see https://example.com — G-056';",
      '<p>blocked on W-008</p>',
      "const glob = 'app/**/*.tsx'; const b = 'ADR-004';",
      '<p>doesn&apos;t matter — W-053</p>',
    ].join('\r\n');
    expect(idsIn(src)).toEqual([
      { line: 5, id: 'G-056', text: "const a = 'see https://example.com — G-056';" },
      { line: 6, id: 'W-008', text: '<p>blocked on W-008</p>' },
      { line: 7, id: 'ADR-004', text: "const glob = 'app/**/*.tsx'; const b = 'ADR-004';" },
      { line: 8, id: 'W-053', text: '<p>doesn&apos;t matter — W-053</p>' },
    ]);
  });

  it('is not fooled by a word that merely ends in a capital letter', () => {
    expect(idsIn("<p>LTG-5 and g-12 and ADR-</p>")).toEqual([]);
  });
});
