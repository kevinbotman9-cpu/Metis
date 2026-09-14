import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourceFiles } from './source-files';
import { findCitations, unresolved, type Citation } from './doc-citations';

/**
 * Every citation of code in the documents resolves (G-126).
 *
 * The convention and why it is this one are in `docs/gaps.md`, G-126, and the
 * parsing is in `tests/doc-citations.ts`. The cases below each hold one rule
 * against a document written for the purpose, so the rule is seen to refuse
 * something before the documents are trusted to pass it.
 */

const root = resolve(__dirname, '..');

/** Untracked drafts, not records (G-125). */
const SKIPPED = ['docs/design/', 'docs/demo/'];

function documents(): string[] {
  return sourceFiles(root).filter(
    (f) =>
      f.endsWith('.md') &&
      (f.startsWith('docs/') || !f.includes('/')) &&
      !SKIPPED.some((s) => f.startsWith(s))
  );
}

const cite = (text: string): Citation => {
  const [c] = findCitations(text).citations;
  if (!c) throw new Error(`no citation read from ${text}`);
  return c;
};

describe('reading a citation', () => {
  it('refuses a line number in prose and in a link target', () => {
    const found = findCitations(
      'The default is in `packages/runtime/src/deterministic/engine.ts:479`,\n' +
        'and [`engine.ts:415`](../../packages/runtime/src/deterministic/engine.ts:415) reads it.\n'
    );
    expect(found.lineNumbered.map((l) => l.text)).toEqual([
      'packages/runtime/src/deterministic/engine.ts:479',
      'engine.ts:415',
      '../../packages/runtime/src/deterministic/engine.ts:415',
    ]);
  });

  it('refuses a continuation, an approximate line and a line after a link', () => {
    const found = findCitations(
      '`route.ts:606` computes it and `:622` reads; near `registry.ts:~155`; in [`BACKLOG.md`](BACKLOG.md):832.\n'
    );
    expect(found.lineNumbered.map((l) => l.text)).toEqual([
      'route.ts:606',
      '`:622`',
      'registry.ts:~155',
      '](BACKLOG.md):832',
    ]);
  });

  it('allows a line number inside a fenced block, which quotes a tool', () => {
    const found = findCitations(
      'It threw:\n\n```\nat getVersion packages/registry/src/postgres-store.ts:87\n```\n\nAfter the fence, `a.ts:3`.\n'
    );
    expect(found.lineNumbered.map((l) => l.text)).toEqual(['a.ts:3']);
  });

  it('reads the path, every symbol and the commit, across a line break', () => {
    const c = cite('see `packages/ledger/src/ledger.ts` ›\n`subjectHash`, `appendRecord` @ `35d0493` for it');
    expect(c).toMatchObject({
      path: 'packages/ledger/src/ledger.ts',
      symbols: ['subjectHash', 'appendRecord'],
      commit: '35d0493',
      line: 1,
    });
  });

  it('reads citations side by side as separate citations, not the next path as a symbol', () => {
    // Eight citations in the documents are written this way. Read as one, the
    // second path became a symbol of the first and its own symbol went unchecked.
    const found = findCitations('`a.ts` › `x`, `b.ts` › `y` @ `35d0493`, and `c.ts` › `z`, `w`');
    expect(found.citations.map((c) => [c.path, c.symbols, c.commit])).toEqual([
      ['a.ts', ['x'], undefined],
      ['b.ts', ['y'], '35d0493'],
      ['c.ts', ['z', 'w'], undefined],
    ]);
  });

  it('refuses a file path where a symbol belongs', () => {
    const found = findCitations(
      '`packages/registry/src/registry.ts` › `ArtifactRegistry`, `packages/compiler/src/decision-flow/compile.ts`; tests'
    );
    expect(found.malformed.map((m) => m.text)).toEqual([
      'packages/registry/src/registry.ts › packages/compiler/src/decision-flow/compile.ts',
    ]);
  });

  it('refuses a path and a symbol not in the form', () => {
    const found = findCitations(
      '`nav.test.ts › the administrator reaches every route` and `traffic.spec.ts` › *does not record*\n'
    );
    expect(found.citations).toEqual([]);
    expect(found.malformed).toHaveLength(2);
  });

  it('does not count a crumb trail as a citation', () => {
    expect(findCitations('Objective › Category › Offer, and group › section')).toEqual({
      citations: [],
      lineNumbered: [],
      malformed: [],
    });
  });
});

describe('resolving a citation', () => {
  it('resolves a symbol the file contains', () => {
    expect(
      unresolved(root, cite('`tests/docs-status.test.ts` › `no other document asserts a capability is built`'))
    ).toBeNull();
  });

  it('resolves a prefix marked with an ellipsis', () => {
    expect(unresolved(root, cite('`tests/docs-status.test.ts` › `no other document asserts…`'))).toBeNull();
  });

  it('refuses a symbol the file does not contain', () => {
    expect(unresolved(root, cite('`tests/docs-status.test.ts` › `a test nobody wrote`'))).toMatch(
      /does not contain "a test nobody wrote"/
    );
  });

  it('refuses every missing symbol, not only the first', () => {
    expect(
      unresolved(root, cite('`tests/docs-status.test.ts` › `STATUS_DOCUMENTS`, `NOT_HERE`, `NOR_THIS`'))
    ).toMatch(/"NOT_HERE", "NOR_THIS"$/);
  });

  it('refuses a path that does not exist, including one missing its directory', () => {
    expect(unresolved(root, cite('`docs/no-such-register.md` › `G-001`'))).toMatch(/does not exist/);
    expect(unresolved(root, cite('`docs-status.test.ts` › `STATUS_DOCUMENTS`'))).toMatch(/does not exist/);
  });

  it('refuses a path relative to the document rather than the repo', () => {
    expect(unresolved(root, cite('`../../tests/docs-status.test.ts` › `STATUS_DOCUMENTS`'))).toMatch(
      /not repo-relative/
    );
  });

  it('refuses a deleted file cited at the tip', () => {
    expect(unresolved(root, cite('`packages/core/src/arbitration.ts` › `PRIORITY_DECIMAL_PLACES`'))).toMatch(
      /does not exist/
    );
  });

  it('resolves a deleted file at a commit that had it', () => {
    expect(
      unresolved(root, cite('`packages/core/src/arbitration.ts` › `PRIORITY_DECIMAL_PLACES` @ `35d0493`'))
    ).toBeNull();
  });

  it('refuses a symbol the file did not contain at that commit', () => {
    expect(
      unresolved(root, cite('`packages/core/src/arbitration.ts` › `rankByPriority` @ `35d0493`'))
    ).toMatch(/at 35d0493 does not contain "rankByPriority"/);
  });

  it('refuses a commit that does not exist', () => {
    expect(
      unresolved(root, cite('`packages/core/src/arbitration.ts` › `PRIORITY_DECIMAL_PLACES` @ `0000000`'))
    ).toMatch(/not reachable/);
  });
});

describe('every document cites code in a form that resolves', () => {
  const scanned = documents().map((file) => ({
    file,
    found: findCitations(readFileSync(resolve(root, file), 'utf8')),
  }));

  it('finds the documents it is checking', () => {
    // A moved docs tree would otherwise make every case below pass by reading nothing.
    const files = scanned.map((s) => s.file);
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('docs/gaps.md');
    expect(files).toContain('CLAUDE.md');
    expect(files.some((f) => f.startsWith('docs/design/'))).toBe(false);
  });

  it('finds citations to check', () => {
    const count = scanned.reduce((n, s) => n + s.found.citations.length, 0);
    // 281 citations were rewritten into the form on 2026-09-14. A floor well
    // under that still catches a parser that has quietly stopped matching.
    expect(count, 'too few citations found; has the form changed?').toBeGreaterThan(250);
  });

  it('cites no code by line number', () => {
    const offenders = scanned.flatMap((s) => s.found.lineNumbered.map((l) => `${s.file}:${l.line} — ${l.text}`));
    expect(
      offenders,
      `${offenders.length} line-numbered citations. Cite \`path\` › \`symbol\`, pinned \`@ \`commit\`\` if the code is gone (G-126).`
    ).toEqual([]);
  });

  it('writes every citation in the form', () => {
    const offenders = scanned.flatMap((s) => s.found.malformed.map((m) => `${s.file}:${m.line} — ${m.text}`));
    expect(offenders, `${offenders.length} citations not in the form \`path\` › \`symbol\``).toEqual([]);
  });

  it('names a path and a symbol that exist', () => {
    const offenders = scanned.flatMap((s) =>
      s.found.citations.flatMap((c) => {
        const why = unresolved(root, c);
        return why ? [`${s.file}:${c.line} — ${why}`] : [];
      })
    );
    expect(offenders, `${offenders.length} citations do not resolve`).toEqual([]);
  });
});
