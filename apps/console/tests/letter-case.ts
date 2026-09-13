import fs from 'node:fs';
import path from 'node:path';

/**
 * Sentence case throughout. `docs/METIS_CONSOLE_SPEC.md` Part 5: "No all-caps
 * labels. No tracked-out eyebrows above headings. Sentence case throughout", and
 * under *Forbidden*, "All-caps tracked eyebrow labels" as one of the tells that
 * make a build read as generated.
 *
 * On 2026-09-13 the console carried 46 `uppercase` classes in 23 files, nearly
 * every one paired with widened letter-spacing: section labels above content,
 * every metric label and every table header through two shared components, nav
 * group labels and three pills. The type-scale guard left them out on purpose
 * (G-102): whether to follow the spec here was a product decision, and the
 * product owner took it the same day.
 *
 * Tight or negative tracking on titles and figures is not what the spec forbids,
 * and is not flagged. `normal-case` is not flagged either.
 *
 * A pure function over a root directory, so it can be pointed at an older
 * checkout to prove it would have caught what it was written for.
 */

export interface CaseOffender {
  file: string;
  line: number;
  rule: string;
  text: string;
}

/** Where a screen's text is styled. Stories included: they are what a reviewer reads as the spec. */
export const SCANNED = ['app', 'components', 'lib'] as const;

const RULES: { rule: string; pattern: RegExp }[] = [
  {
    // A class, not the word: `<option value="uppercase">` in the intake mapping
    // form is a transform a user can choose, and a quoted string that is only
    // the word is that, not a class list.
    rule: 'an all-caps class — write the label in sentence case',
    pattern: /(?<=[\s"'`])uppercase(?=[\s"'`])(?<!["'`]uppercase(?=["'`]))/g,
  },
  {
    rule: 'widened letter-spacing — tracked-out labels are forbidden',
    pattern: /(?<![-\w])tracking-(?:wide|wider|widest|\[(?:0?\.\d+|[1-9]\d*(?:\.\d+)?)(?:em|rem|px)\])(?![-\w])/g,
  },
  {
    rule: 'an inline all-caps or letter-spacing style',
    pattern: /\b(?:textTransform\s*:\s*['"`]uppercase|letterSpacing\s*:\s*['"`]?(?!-|0\b|normal))/g,
  },
  {
    rule: 'a CSS all-caps or letter-spacing declaration',
    pattern: /(?:text-transform\s*:\s*uppercase|letter-spacing\s*:\s*(?!-|0[;\s}]|normal))/g,
  },
];

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

/** Every all-caps or tracked-out site under `root` (an `apps/console` directory), in file and line order. */
export function caseOffenders(root: string): CaseOffender[] {
  const found: CaseOffender[] = [];
  for (const full of files(root)) {
    const file = path.relative(root, full).split(path.sep).join('/');
    fs.readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .forEach((text, i) => {
        for (const { rule, pattern } of RULES) {
          for (const _ of text.matchAll(pattern)) found.push({ file, line: i + 1, rule, text: text.trim() });
        }
      });
  }
  return found;
}
