import fs from 'node:fs';
import path from 'node:path';

/**
 * Every place type is set outside the scale. `docs/METIS_CONSOLE_SPEC.md` Part 5,
 * *Type*.
 *
 * The scale is small on purpose: two families (`font-sans`, `font-mono`); four
 * sizes, all density-scoped (`text-label`, `text-body`, `text-title`,
 * `text-figure`); line height set once, on `body`, and on the figure token where
 * a large number needs it; weights 400, 500 and 600, nothing heavier.
 *
 * On 2026-09-13 a sweep found 126 sites outside it in 34 files: 82 fixed sizes
 * — 45 of them the *compact* label size hardcoded, so those labels ignored the
 * density axis entirely — 21 line-height overrides, 11 Tailwind default sizes,
 * 8 bold weights and one inline SVG font size. UX_CONTRACT §3 forbade all of it
 * and the conformance check looked only at colour and px spacing, so nothing
 * noticed.
 *
 * A pure function over a root directory, so the check that guards the console
 * can also be pointed at an older checkout to prove it would have caught the
 * sites it was written for.
 *
 * All-caps and letter-spacing are deliberately not here: the spec forbids them
 * too, but whether to follow that is a design decision registered as G-102.
 */

export interface TypeOffender {
  file: string;
  line: number;
  rule: string;
  text: string;
}

/** The directories a screen's type can be set in. */
export const SCANNED = ['app', 'components', 'lib'] as const;

const RULES: { rule: string; pattern: RegExp }[] = [
  {
    rule: 'a fixed font size — use text-label, text-body, text-title or text-figure',
    pattern: /\btext-\[[\d.]+(?:rem|px|em)\]/g,
  },
  {
    rule: 'a Tailwind default size — it is not density-scoped',
    pattern: /(?<![-\w])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
  },
  {
    rule: 'a line-height override — line height is set on body, and on a size token that needs its own',
    pattern: /(?<![-\w])leading-(?:none|tight|snug|normal|relaxed|loose|\d+|\[[^\]]+\])/g,
  },
  {
    rule: 'a weight outside 400, 500 and 600',
    pattern: /(?<![-\w])font-(?:thin|extralight|light|bold|extrabold|black)\b/g,
  },
  {
    rule: 'a family other than font-sans or font-mono',
    pattern: /(?<![-\w])font-\[[^\]]+\]/g,
  },
  {
    // The whitespace sits inside the lookahead. Outside it, `\s*` could match
    // nothing, the lookahead would then see the space rather than the value, and
    // `fontSize: 'var(--text-label)'` — the fix — would be reported as the fault.
    rule: 'an inline font style that does not read a token',
    pattern: /\b(?:fontSize|lineHeight|fontWeight|fontFamily)\s*:(?!\s*['"`]?var\(--)\s*[^,}\n]+/g,
  },
  {
    rule: 'a CSS font declaration that does not read a token',
    pattern: /(?:^|[;{\s])(?:font-size|line-height|font-weight|font-family)\s*:(?!\s*var\(--)\s*[^;}\n]+/g,
  },
];

/** The file that defines the tokens, where raw values are the point. */
const TOKEN_FILES = new Set(['app/globals.css']);

function files(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const d of SCANNED) walk(path.join(root, d));
  return out;
}

/** Every off-scale site under `root` (an `apps/console` directory), in file and line order. */
export function typeOffenders(root: string): TypeOffender[] {
  const found: TypeOffender[] = [];
  for (const full of files(root)) {
    const file = path.relative(root, full).split(path.sep).join('/');
    if (TOKEN_FILES.has(file)) continue;
    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((text, i) => {
      for (const { rule, pattern } of RULES) {
        for (const _ of text.matchAll(pattern)) {
          found.push({ file, line: i + 1, rule, text: text.trim() });
        }
      }
    });
  }
  return found;
}
