import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The gap register stays usable.
 *
 * `docs/gaps.md` is where `CLAUDE.md` sends every blocked agent first, and by
 * 2026-09-09 it had grown to 950 lines of prose in no order: entries from four
 * different weeks interleaved, most with no id, a "Status at a glance" table
 * that duplicated the capability map and had been stale for three days, and a
 * "How to Use This File" section that predated half the file. Every session
 * appended to it because the process says to, and no session had a reason to
 * read it.
 *
 * The specific failure that made this checkable: `W-053`, `W-054` and `W-055`
 * were written into this register, into `docs/CAPABILITIES.md`, into two page
 * components and into a unit test — all in one slice, all citing a backlog that
 * had never heard of any of them. Nothing noticed for a day. A citation that
 * does not resolve is worse than no citation, because it costs the next reader
 * a search before it costs them the answer.
 *
 * So an entry is a `### G-NNN — title` heading followed by a metadata line, and
 * this holds four things about it: the id is unique and well-formed, it carries
 * a date, it carries a status, and every W-number it names exists in
 * `BACKLOG.md`.
 *
 * The W check is deliberately repo-wide rather than register-only. The three
 * dangling numbers were in source files as well, and a rule that only looked at
 * one document would have missed two thirds of the problem.
 */

const root = resolve(__dirname, '..');
const GAPS = readFileSync(resolve(root, 'docs/gaps.md'), 'utf8');
const BACKLOG = readFileSync(resolve(root, 'docs/BACKLOG.md'), 'utf8');

/** Work items the backlog actually defines, by their own headings. */
const DEFINED = new Set([...BACKLOG.matchAll(/^### (W-\d{3})/gm)].map((m) => m[1]));

/**
 * Sections whose `###` headings are not gap entries.
 *
 * One entry, with a reason, rather than a pattern that quietly widens — the
 * same rule `tests/vocabulary.test.ts` follows for its allow-list.
 */
const NOT_ENTRIES = new Set(['Appendix — operations resolved by the contract work']);

interface Entry {
  id: string;
  title: string;
  meta: string;
  line: number;
}

function entries(): Entry[] {
  const lines = GAPS.split('\n');
  const found: Entry[] = [];
  let section = '';
  lines.forEach((line, i) => {
    if (line.startsWith('## ')) section = line.slice(3).trim();
    if (!line.startsWith('### ') || NOT_ENTRIES.has(section)) return;
    const m = line.match(/^### (G-\d{3}) — (.+)$/);
    found.push({
      id: m ? m[1] : '',
      title: m ? m[2] : line.slice(4).trim(),
      // The metadata line is the first non-blank line after the heading.
      meta: (lines.slice(i + 1, i + 4).find((l) => l.trim() !== '') ?? '').trim(),
      line: i + 1,
    });
  });
  return found;
}

describe('the gap register stays usable', () => {
  const all = entries();

  it('finds the entries it is checking', () => {
    // Without this a restructure that moved or renamed the register would make
    // every assertion below pass by scanning nothing.
    expect(all.length, 'no gap entries found; has docs/gaps.md changed shape?').toBeGreaterThan(20);
    expect(GAPS).toMatch(/^## Open$/m);
    expect(GAPS).toMatch(/^## Resolved$/m);
  });

  it('gives every entry an id', () => {
    const anonymous = all.filter((e) => !e.id).map((e) => `gaps.md:${e.line} — ${e.title}`);
    expect(anonymous, 'a gap with no id cannot be cited from anywhere else').toEqual([]);
  });

  it('uses each id once', () => {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const e of all) {
      if (seen.has(e.id)) dupes.push(`${e.id} at lines ${seen.get(e.id)} and ${e.line}`);
      else seen.set(e.id, e.line);
    }
    expect(dupes).toEqual([]);
  });

  it('gives every entry a date', () => {
    const undated = all
      .filter((e) => !/\*\*Registered:\*\* \d{4}-\d{2}-\d{2}/.test(e.meta))
      .map((e) => `${e.id} (gaps.md:${e.line}) — ${e.meta.slice(0, 60) || '(no metadata line)'}`);
    expect(undated, 'a gap with no date cannot be aged, and an old gap is the finding').toEqual([]);
  });

  it('gives every entry a status, and a resolved date when it is resolved', () => {
    const bad: string[] = [];
    for (const e of all) {
      const status = e.meta.match(/\*\*Status:\*\* (\w+)/)?.[1];
      if (!status) {
        bad.push(`${e.id}: no status`);
        continue;
      }
      if (!['Open', 'Resolved'].includes(status)) bad.push(`${e.id}: status "${status}"`);
      if (status === 'Resolved' && !/\*\*Resolved:\*\* \d{4}-\d{2}-\d{2}/.test(e.meta)) {
        bad.push(`${e.id}: resolved with no date`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('cites no work item the backlog has never heard of', () => {
    expect(DEFINED.size, 'no W-numbers found in BACKLOG.md').toBeGreaterThan(40);
    const dangling = [...GAPS.matchAll(/\bW-\d{3}\b/g)]
      .map((m) => m[0])
      .filter((w) => !DEFINED.has(w));
    expect(
      [...new Set(dangling)],
      'add it to BACKLOG.md, or cite one that exists'
    ).toEqual([]);
  });

  it('cites no work item the backlog has never heard of, anywhere in the repo', () => {
    // The three that started this were in page components and a unit test as
    // well as in the register. Checking one document would have found one of
    // three problems.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(md|ts|tsx|mjs|js|yaml|kt)$/.test(f));

    const dangling: string[] = [];
    for (const file of tracked) {
      let source: string;
      try {
        source = readFileSync(resolve(root, file), 'utf8');
      } catch {
        continue;
      }
      for (const m of source.matchAll(/\bW-\d{3}\b/g)) {
        if (!DEFINED.has(m[0])) dangling.push(`${file}: ${m[0]}`);
      }
    }
    expect([...new Set(dangling)]).toEqual([]);
  });

  it('is cited back by no gap id that does not exist', () => {
    // The mirror of the rule above, added because the same mistake was made in
    // the other direction within an hour of writing this file: BACKLOG.md's new
    // W-053, W-054 and W-055 each pointed at a G-number that the restructure
    // had given to something else entirely. A one-directional check would have
    // passed on all three.
    const ids = new Set(all.map((e) => e.id));
    const dangling = [...BACKLOG.matchAll(/\bG-\d{3}\b/g)]
      .map((m) => m[0])
      .filter((g) => !ids.has(g));
    expect([...new Set(dangling)], 'BACKLOG.md cites a gap that is not in the register').toEqual(
      []
    );
  });

  it('does not carry a second capability claim', () => {
    // The deleted "Status at a glance" table said 39 operations built. It was
    // three days stale when it was found, and `docs/CAPABILITIES.md` is the
    // single claim by design — `tests/docs-status.test.ts` exists for exactly
    // this failure and could not see a table that counted rather than asserted.
    expect(GAPS).not.toMatch(/^## Status at a glance/m);
    expect(GAPS, 'the operation count belongs in one place').not.toMatch(
      /Built, served, and contract-tested/
    );
  });
});
