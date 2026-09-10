import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourceFiles } from './source-files';

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
 * **Documentation is scanned too, as of 2026-09-08.** It was excluded on the
 * reasoning that docs have to be able to say what the words used to be. That is
 * true of a handful of documents whose *subject* is the rename, and it was doing
 * no work for the rest: the words had drifted back into the backlog, the review
 * set and the ADRs, where they read as current usage rather than history. So the
 * exclusion is now a named list — `ALLOWED`, one line and one reason per file —
 * rather than a whole tree. A file that has to name the old vocabulary says so
 * out loud and somebody signs it.
 *
 * This file excludes itself, because a check that reads its own list passes on
 * anything. That lesson cost a real defect elsewhere in this repo.
 *
 * **The whole tree, not just what is committed.** The scan reads `sourceFiles`,
 * which unions `git ls-files` with the untracked-and-not-ignored set. This said
 * "tracked files only" and called it deliberate — *the check guards what the
 * repo actually carries* — which is true of a CI run, where everything is
 * committed by definition, and wrong about the run that matters. The author is
 * at a local `npm test` with the file they just wrote still untracked, and that
 * is the one moment the fix is an edit rather than a rewritten commit.
 *
 * G-048 is what the old reading cost: `placement-form-dialog.tsx` used a
 * renamed-away-from word, the slice that introduced it went green because the
 * file was untracked, and it surfaced four slices later during a merge, in a PR
 * about something else.
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

/** Source trees. */
const SCANNED = [
  /^packages\/[^/]+\/(src|tests)\//,
  /^apps\/console\/(app|components|lib|mocks|tests)\//,
  /^engines\/kotlin\/[^/]+\/src\//,
  /^bench\/[^/]+\/src\//,
  /^scripts\//,
  /^tests\//,
];

const CODE = /\.(ts|tsx|kt|mjs|js|yaml)$/;

/** Documentation: everything under `docs/`, plus the markdown at the root. */
const DOCS = [/^docs\//, /^[^/]+\.md$/];

const MARKDOWN = /\.md$/;

/** Every file this check reads, code and prose alike. */
function inScope(file: string): boolean {
  if (CODE.test(file) && SCANNED.some((p) => p.test(file))) return true;
  return MARKDOWN.test(file) && DOCS.some((p) => p.test(file));
}

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
  [
    'CLAUDE.md',
    'holds the §3 catalogue, which names each old word beside the one that ' +
      'replaced it — the document the rest of this check enforces',
  ],
  [
    'docs/CAPABILITIES.md',
    'its §3/§4 rows are about the rename itself: what it covered, what it moved ' +
      '(every chain hash), and the one part still outstanding',
  ],
  [
    'METIS_Vision_and_Build_Plan.md',
    'opens with a note recording the vocabulary it was written in, so the ' +
      'document can be read against the platform it describes',
  ],
  [
    'METIS_Experience_Layer_Build_Plan.md',
    'same note, same reason',
  ],
  [
    'docs/EXPERIENCE_LAYER_STATUS.md',
    'its "The taxonomy rename, 2026-09-05" section lists the seven words the ' +
      'platform was renamed away from in order to record what changed and why ' +
      'every chain hash moved that day',
  ],
  [
    'docs/review/VERIFIED_STATE.md',
    'quotes the experiment that proved this check was missing — adding ' +
      '`export type Proposition = Offer; export type Treatment = Creative;` to ' +
      'the domain passed typecheck, lint and every suite, which is the finding ' +
      'that made this file exist',
  ],
  [
    'docs/review/INBOUND_VS_CDH.md',
    'a comparison against Pega CDH whose §1 describes that product\'s own ' +
      'structure, where treatment, engagement policy and contact policy are ' +
      'the correct names for the things being described; the METIS-side prose ' +
      'in the same file uses the §3 catalogue',
  ],
]);

/** Named for what it returns, which is no longer only what git tracks. */
function tracked(): string[] {
  return sourceFiles(root);
}

describe('the vocabulary is vendor-neutral, and stays that way', () => {
  it('scans a source tree that is actually there', () => {
    // A guard on the guard: a path pattern that stops matching would make every
    // assertion below pass by scanning nothing.
    const files = tracked().filter(inScope);
    const code = files.filter((f) => CODE.test(f));
    const docs = files.filter((f) => MARKDOWN.test(f));
    expect(code.length, 'the scanned source set is empty — did a tree move?').toBeGreaterThan(60);
    expect(docs.length, 'the scanned docs set is empty — did docs/ move?').toBeGreaterThan(10);
  });

  it('every allow-listed file exists and states its reason', () => {
    // An entry left behind by a deleted or renamed file is an exemption nobody
    // is holding, and the next file to land on that path inherits it silently.
    for (const [file, reason] of ALLOWED) {
      expect(tracked(), `${file} is allow-listed but not tracked`).toContain(file);
      expect(reason.length, `${file} has no stated reason`).toBeGreaterThan(20);
    }
  });

  it('uses none of the words the platform was renamed away from', () => {
    const files = tracked().filter((f) => inScope(f) && !ALLOWED.has(f));

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
