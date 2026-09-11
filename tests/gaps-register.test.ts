import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourceFiles } from './source-files';

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

/**
 * Read a document with its line endings normalised.
 *
 * Every pattern below is anchored with `$`, and in JavaScript `.` does not match
 * a carriage return — so on a checkout with `core.autocrlf=true` (the Windows
 * default) `### G-001 — …\r` matches nothing, every entry parses with an empty
 * id, and this file reports 36 anonymous entries, 35 duplicate ids and a
 * dangling `G-033` that is sitting in the register at line 1092. All three are
 * artefacts of the checkout. CI runs on Linux, so the check was green there and
 * red on any Windows clone, which is the worst way round.
 */
const read = (path: string): string =>
  readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

const GAPS = read('docs/gaps.md');
const BACKLOG = read('docs/BACKLOG.md');

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
  /** The `##` heading the entry sits under: Open, or Resolved. */
  section: string;
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
      section,
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

  it('files every entry under the section its status names', () => {
    // The register's own instructions say a closed entry moves to Resolved.
    // Nothing checked it, and four had not moved: G-049, G-050, G-054 and
    // G-060, all resolved within a week of being written. The Open section
    // listed 38 entries where 34 were open, so anyone counting what is still
    // wrong by reading the headings got a number that was wrong by four — and
    // reading an entry to find out is exactly the cost the register exists to
    // remove.
    const expected: Record<string, string> = { Open: 'Open', Resolved: 'Resolved' };
    const misfiled = all
      .filter((e) => e.meta.match(/\*\*Status:\*\* (\w+)/)?.[1] !== expected[e.section])
      .map(
        (e) =>
          `${e.id} (gaps.md:${e.line}) is under "## ${e.section}" with ` +
          `${e.meta.match(/\*\*Status:\*\* \w+/)?.[0] ?? '(no status)'}`
      );
    expect(
      misfiled,
      'move the entry to the section its status names, or correct the status'
    ).toEqual([]);
  });

  it('has both sections populated, so the check above is checking something', () => {
    // A guard on the guard. If a restructure renamed either heading, every
    // entry would land in one section and the comparison above would still
    // pass for that half.
    const bySection = new Map<string, number>();
    for (const e of all) bySection.set(e.section, (bySection.get(e.section) ?? 0) + 1);
    expect(bySection.get('Open'), 'no entries under ## Open').toBeGreaterThan(10);
    expect(bySection.get('Resolved'), 'no entries under ## Resolved').toBeGreaterThan(10);
    expect([...bySection.keys()].sort(), 'an entry sits outside Open and Resolved').toEqual([
      'Open',
      'Resolved',
    ]);
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
    // Untracked files included. The three dangling ids that prompted this check
    // were in page components and a unit test as well as in the register, and a
    // page component is untracked for exactly as long as it takes to write —
    // which is when citing a work item that does not exist is easiest to do.
    const tracked = sourceFiles(root).filter((f) =>
      /\.(md|ts|tsx|mjs|js|yaml|kt)$/.test(f)
    );

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

/**
 * The backlog, held to the same rule.
 *
 * `docs/BACKLOG.md` was the last document in this repository where a completion
 * claim could be typed by hand and checked by nothing. Nine items carried
 * `**DONE 2026-09-06**` in their headings — a bold string, authored, which is
 * precisely what Rule 7 in `CLAUDE.md` forbids everywhere else. It was
 * allow-listed in `tests/docs-status.test.ts` on the reasoning that recording
 * which items are done is history rather than a status claim; that reasoning
 * held while it was a queue, and stopped holding once `CAPABILITIES.md` began
 * citing it as the authority for what a PLANNED row is waiting on.
 *
 * So a `DONE` here must name a check, and the check must exist. The rule is
 * deliberately about the file existing rather than about the test passing:
 * asserting that another suite is green from inside this one would be a check
 * that passes when the thing it guards is deleted, which is the shape of defect
 * this whole family of tests was written to catch.
 */
interface Item {
  id: string;
  meta: string;
  body: string;
  line: number;
}

function backlogItems(): Item[] {
  const lines = BACKLOG.split('\n');
  const items: Item[] = [];
  lines.forEach((line, i) => {
    const m = line.match(/^### (W-\d{3}) — /);
    if (!m) return;
    const next = lines.findIndex((l, j) => j > i && /^### W-\d{3} — /.test(l));
    const body = lines.slice(i + 1, next === -1 ? lines.length : next).join('\n');
    items.push({
      id: m[1],
      // Metadata is the block between the heading and the first blank line
      // after it; the prose follows.
      meta: body.split('\n\n').slice(0, 2).join('\n'),
      body,
      line: i + 1,
    });
  });
  return items;
}

describe('the backlog emits its status rather than authoring it', () => {
  const items = backlogItems();

  it('finds the items it is checking', () => {
    expect(items.length, 'no work items found; has BACKLOG.md changed shape?').toBeGreaterThan(50);
    expect(items.map((i) => i.id)).toContain('W-000');
  });

  it('gives every item a registered date', () => {
    const undated = items
      .filter((i) => !/\*\*Registered:\*\* \d{4}-\d{2}-\d{2}/.test(i.meta))
      .map((i) => `${i.id} (BACKLOG.md:${i.line})`);
    expect(undated, 'the date comes from git; see scripts, not memory').toEqual([]);
  });

  it('gives every item a stage', () => {
    const unstaged = items
      .filter((i) => !/\*\*Stage:\*\* \d+/.test(i.meta))
      .map((i) => `${i.id} (BACKLOG.md:${i.line})`);
    expect(unstaged).toEqual([]);
  });

  it('gives every item a done-when', () => {
    // What would close it, stated before it closes. An item with no done-when
    // is closed by whoever decides they are finished.
    const vague = items
      .filter((i) => !/\*\*Done when:?\*\*|\*\*Done:\*\*|\*\*Closed/i.test(i.body))
      .map((i) => `${i.id} (BACKLOG.md:${i.line})`);
    expect(vague).toEqual([]);
  });

  it('gives every item one of three statuses', () => {
    const bad = items
      .filter((i) => !/\*\*Status:\*\* (DONE|PARTIAL|OPEN)\b/.test(i.meta))
      .map((i) => `${i.id}: ${i.meta.match(/\*\*Status:\*\*.*/)?.[0] ?? '(none)'}`);
    expect(bad).toEqual([]);
  });

  it('makes every DONE cite a check that exists on disk', () => {
    const offenders: string[] = [];
    for (const item of items) {
      if (!/\*\*Status:\*\* (DONE|PARTIAL)\b/.test(item.meta)) continue;
      const check = item.meta.match(/\*\*Check:\*\* (.+)/)?.[1] ?? '';
      if (!check || /^none\b/.test(check)) {
        offenders.push(`${item.id}: claims DONE and names no check`);
        continue;
      }
      // Every backticked path in the Check line that looks like a file.
      const paths = [...check.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1])
        .filter((p) => /\.(ts|tsx|json|mjs)$/.test(p) && p.includes('/'));
      if (paths.length === 0) {
        offenders.push(`${item.id}: check names no file — "${check.slice(0, 60)}"`);
        continue;
      }
      for (const p of paths) {
        if (!existsSync(resolve(root, p))) offenders.push(`${item.id}: no such file ${p}`);
      }
    }
    expect(
      offenders,
      'an item claiming DONE with no nameable check is not DONE'
    ).toEqual([]);
  });

  it('keeps the status out of the last cell of the summary table', () => {
    // `tests/docs-status.test.ts` reads the last cell. The gate number ends the
    // row on purpose, and the allow-list this file used to have is gone.
    const rows = BACKLOG.split('\n').filter((l) => /^\| W-\d{3} \|/.test(l));
    expect(rows.length).toBeGreaterThan(50);
    const trailing = rows.filter((r) => {
      const cells = r.trim().slice(1, -1).split('|').map((c) => c.trim());
      return !/^\d$/.test(cells[cells.length - 1]);
    });
    expect(trailing, 'the gate number ends a summary row').toEqual([]);
  });

  it('is no longer exempt from the single-claim rule', () => {
    const docsStatus = readFileSync(resolve(root, 'tests/docs-status.test.ts'), 'utf8');
    expect(
      docsStatus.includes("'docs/BACKLOG.md'"),
      'BACKLOG.md is allow-listed again; it was removed on 2026-09-09 and passed without it'
    ).toBe(false);
  });
});
