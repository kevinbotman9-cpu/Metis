import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The vocabulary stays vendor-neutral, and something checks it.
 *
 * §3 of the platform specification is normative and `CLAUDE.md` holds the
 * catalogue. The rename landed on 2026-09-05 and reached the hashed decision —
 * every chain hash in every corpus changed that day — but nothing has kept it
 * that way since. Phase A found that adding `export type Proposition = Offer`
 * to the domain passes typecheck, lint and every suite, which is what made the
 * BUILT row false: the rename is real and complete, and there was no check.
 *
 * Drift back is the specific risk. The words below are the ones the platform
 * was renamed *away from*, so one appearing in source is either a mistake or a
 * decision somebody should make in the open rather than in a commit.
 *
 * **What this deliberately does not scan.** Documentation, which has to be able
 * to say what the words used to be — this file is the same, and excludes
 * itself, because a check that reads its own list passes on anything. That
 * lesson cost a real defect elsewhere in this repo.
 *
 * Some of these words have ordinary English senses, and the first run found
 * one: "the block treatment" in a comment, meaning the styling. It was reworded
 * rather than allowed. In a codebase that renamed away from `treatment`, prose
 * using the word is confusing whichever sense was meant, so the collision is a
 * reason to avoid it here rather than a reason to loosen the check.
 */

const root = resolve(__dirname, '..');

/**
 * Renamed away from, with what replaced each.
 *
 * `arbitration` and `propensity` are absent on purpose: §3.2 keeps both as
 * industry-standard terms, and a check that flagged them would be enforcing a
 * rule the specification does not make.
 */
const RENAMED: { word: RegExp; was: string; now: string }[] = [
  { word: /\bpropositions?\b/i, was: 'proposition', now: 'offer' },
  { word: /\btreatments?\b/i, was: 'treatment', now: 'creative' },
  { word: /\bengagement polic(y|ies)\b/i, was: 'engagement policy', now: 'targeting policy' },
  { word: /\bcontact polic(y|ies)\b/i, was: 'contact policy', now: 'frequency & suppression policy' },
  { word: /\blevers?\b/i, was: 'lever', now: 'business boost' },
  { word: /\bdecision strateg(y|ies)\b/i, was: 'decision strategy', now: 'decision flow' },
  { word: /\bapplicability\b/i, was: 'applicability', now: 'relevance' },
  { word: /\bchange requests?\b/i, was: 'change request', now: 'change set' },
];

/** Source trees. Documentation is excluded — see the note above. */
const SCANNED = [
  /^packages\/[^/]+\/(src|tests)\//,
  /^apps\/console\/(app|components|lib|mocks|tests)\//,
  /^engines\/kotlin\/[^/]+\/src\//,
  /^bench\/[^/]+\/src\//,
  /^scripts\//,
  /^tests\//,
];

const CODE = /\.(ts|tsx|kt|mjs|js|yaml)$/;

/**
 * Where a renamed word is the subject rather than a relapse.
 *
 * Listed one by one with the reason, so adding an entry is a decision somebody
 * makes on purpose rather than a pattern that quietly widens.
 */
const ALLOWED = new Map<string, string>([
  ['tests/vocabulary.test.ts', 'holds the list of renamed words'],
  [
    'apps/console/mocks/fixtures/catalogue.ts',
    'creative ids are `trt_*`, dating from before the rename; changing them ' +
      'would move every chain hash in the service corpus for a cosmetic gain',
  ],
]);

function tracked(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 32e6 })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

describe('the vocabulary is vendor-neutral, and stays that way', () => {
  it('scans a source tree that is actually there', () => {
    // A guard on the guard: a path pattern that stops matching would make every
    // assertion below pass by scanning nothing.
    const files = tracked().filter((f) => CODE.test(f) && SCANNED.some((p) => p.test(f)));
    expect(files.length, 'the scanned set is empty — did a source tree move?').toBeGreaterThan(60);
  });

  it('uses none of the words the platform was renamed away from', () => {
    const files = tracked().filter(
      (f) => CODE.test(f) && SCANNED.some((p) => p.test(f)) && !ALLOWED.has(f)
    );

    const offenders: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(resolve(root, file), 'utf8');
      } catch {
        continue; // Deleted in the working tree; not this test's business.
      }

      const lines = text.split('\n');
      for (const [i, line] of lines.entries()) {
        for (const { word, was, now } of RENAMED) {
          if (word.test(line)) {
            offenders.push(`${file}:${i + 1} "${was}" — say "${now}" (§3, CLAUDE.md)`);
          }
        }
      }
    }

    expect(
      offenders,
      'The vocabulary in CLAUDE.md is normative. If one of these is right ' +
        'anyway, add the file to ALLOWED with the reason.'
    ).toEqual([]);
  });

  it('does not flag the terms §3.2 keeps on purpose', () => {
    // `arbitration` and `propensity` are retained industry-standard terms. A
    // check that grew to flag them would be enforcing a rule the specification
    // does not make, and somebody would rename them to satisfy it.
    const sample = 'Arbitration ranks by propensity, value and boost.';
    for (const { word } of RENAMED) expect(word.test(sample)).toBe(false);
  });
});
