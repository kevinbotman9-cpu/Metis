import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
