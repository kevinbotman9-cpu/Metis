import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';

/**
 * No literal control characters in tracked source.
 *
 * This exists because it happened three times in two days, and each time it
 * was invisible: a NUL byte inside a template literal renders as a space, so
 * it survives every reading of the file. Git then stores the file as binary,
 * which costs the diff, the blame and the review — the very things that would
 * have caught it.
 *
 * The other two were worse than cosmetic. `ADR-003`, the normative document
 * for canonical serialisation, documented the backslash-u escape with a literal
 * U+0000 where the escape text belonged; and the corpus generator carried
 * three, as the data of the cases asserting how those characters serialise.
 *
 * Reviewing harder is not a fix for a defect that is invisible to review.
 */

const root = resolve(__dirname, '..');

/** Tab, newline and carriage return are ordinary text. Nothing else is. */
const isForbidden = (byte: number) =>
  byte === 0x7f || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d);

/**
 * Where a control character is the subject rather than a mistake.
 *
 * Both hold characters deliberately: the corpus is generated output whose test
 * cases assert how U+007F serialises, and the Kotlin canonicaliser matches a
 * form feed to escape it. Listed rather than pattern-matched, so adding one is
 * a decision someone makes on purpose.
 */
const ALLOWED = new Set([
  'docs/conformance/canonical-corpus.json',
  'engines/kotlin/engine/src/main/kotlin/com/metis/canonical/Canonical.kt',
]);

const BINARY = /\.(jar|png|jpg|jpeg|gif|ico|woff2?|ttf|eot|pdf|zip|gz|webp|mp4)$/i;

describe('no build output inside a source tree', () => {
  /**
   * Compiled JavaScript beside its TypeScript silently wins.
   *
   * Vite resolves an extensionless import to `.js` before `.ts`, so a stray
   * `engine.js` next to `engine.ts` means every test importing it runs the
   * stale compile instead of the source. A `throw` planted at the top of
   * `execute` changed nothing — four tests passed against code that could not
   * run — and that is how it was found.
   *
   * It was self-inflicted: `tsc --build` emitted them while the typecheck was
   * being repaired. The root `build` script has been removed, because nothing
   * consumed its output and `GETTING_STARTED.md` already told people not to
   * run it. This is the check that says so if it comes back.
   */
  it('no compiled artifact sits beside its source', () => {
    // Walks the filesystem, not git.
    //
    // `.gitignore` already carries `packages/*/src/**/*.js`, added after the
    // last time this happened. That rule stops the artifacts being committed
    // and does nothing about them shadowing at runtime — and by hiding them
    // from `git status` it arguably made the real hazard harder to see. A
    // git-based check here found nothing for exactly that reason.
    const roots = ['packages', 'bench'];
    const strays: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|d\.ts|js\.map|d\.ts\.map)$/.test(entry.name)) {
          strays.push(relative(root, full).split(sep).join('/'));
        }
      }
    };

    for (const top of roots) {
      const base = resolve(root, top);
      if (!existsSync(base)) continue;
      for (const pkg of readdirSync(base, { withFileTypes: true })) {
        if (!pkg.isDirectory()) continue;
        const src = resolve(base, pkg.name, 'src');
        if (existsSync(src)) walk(src);
      }
    }

    expect(
      strays,
      'Compiled output inside a src tree shadows the TypeScript beside it: an ' +
        'extensionless import resolves to the .js, and the source stops being ' +
        'what runs. Delete these — nothing consumes them.'
    ).toEqual([]);
  });
});

describe('source hygiene', () => {
  it('no tracked text file holds a literal control character', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => !BINARY.test(f))
      .filter((f) => !ALLOWED.has(f));

    // A guard on the guard: an empty list would make this pass vacuously.
    expect(tracked.length, 'git ls-files returned nothing').toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const file of tracked) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(resolve(root, file));
      } catch {
        continue; // Deleted in the working tree; not this test's business.
      }
      const at = bytes.findIndex(isForbidden);
      if (at !== -1) {
        const byte = bytes[at];
        const context = bytes
          .subarray(Math.max(0, at - 40), at + 20)
          .toString('utf8')
          // Matching control characters is the job: this renders the bytes
          // around a forbidden one for a person to read, and a raw NUL or ESC
          // in that output would corrupt the terminal it is printed to. The
          // rule is right in general and wrong here.
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001f\u007f]/g, '?');
        offenders.push(
          `${file}: 0x${byte.toString(16).padStart(2, '0')} at byte ${at} — ...${context}...`
        );
      }
    }

    expect(
      offenders,
      'Write these as escapes. A literal control character reads as a space, ' +
        'and makes git treat the file as binary — no diff, no blame, no review.'
    ).toEqual([]);
  });
});
