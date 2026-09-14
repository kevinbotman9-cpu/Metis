import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * How a document cites code, and whether the citation still resolves (G-126).
 *
 * A citation is `` `path` › `symbol` ``: a repo-relative path and a text the
 * file contains. Several symbols in one file are `` `path` › `a`, `b` ``, and a
 * trailing `…` makes a symbol a prefix. Code that no longer exists is cited at
 * a commit `main` reaches, `` `path` › `symbol` @ `commit` ``, and resolves
 * against the file as it was there.
 *
 * `file.ext:NN` is not a citation. A sampled third of this register's line
 * numbers landed on the wrong line, and nothing could tell, because a line
 * number that drifts still names a line. A symbol that is renamed stops being
 * found. Line numbers are allowed only inside a fenced block, which quotes what
 * a tool printed rather than pointing at code.
 */

export type Citation = {
  path: string;
  symbols: string[];
  commit?: string;
  line: number;
  text: string;
};

export type Found = {
  citations: Citation[];
  /** `file.ext:NN`, outside a fenced block. */
  lineNumbered: { line: number; text: string }[];
  /** A path followed by `›` that is not in the citation form. */
  malformed: { line: number; text: string }[];
};

const EXT = 'ts|tsx|mjs|cjs|js|kt|kts|java|py|sh|sql|yaml|yml|json|md|css|html|toml|gradle';

const RANGE = '\\d+(?:[-–]\\d+)?(?:,\\s?\\d+(?:[-–]\\d+)?)*';

const LINE_NUMBERED = [
  // `engine.ts:522`, `route.ts:1952-1961`, `page.tsx:145,148`, `registry.ts:~155`
  new RegExp(`(?:[A-Za-z0-9_\\-.\\[\\]]+\\/)*[A-Za-z0-9_\\-.\\[\\]]+\\.(?:${EXT}):~?${RANGE}`, 'g'),
  // A continuation of the citation before it: `route.ts:606` computes it and `:622` reads
  new RegExp(`\`:~?${RANGE}\``, 'g'),
  // A line number after a link: [`BACKLOG.md`](BACKLOG.md):832
  new RegExp(`\\]\\([^)\\s]+\\):${RANGE}`, 'g'),
];

/**
 * A symbol followed by `›` is the next citation's path, not this one's symbol:
 * `` `a.ts` › `x`, `b.ts` › `y` `` is two citations.
 */
const CITATION = /`([^`\s]+\.[A-Za-z]+)`\s+›\s+(`[^`\n]+`(?:\s*,\s*`[^`\n]+`(?!\s+›))*)(?:\s+@\s+`([0-9a-f]{7,40})`)?/g;

/** A backticked path and `›` with no backticked symbol after it, or both in one span. */
const MALFORMED = [/`[^`\s]+\.[A-Za-z]+`\s+›\s+(?!`)/g, /`[^`\s]+\.[A-Za-z]+\s+›\s+[^`]+`/g];

/** Blank every fenced block, keeping offsets and line breaks where they were. */
function maskFences(text: string): string {
  let inFence = false;
  return text
    .split('\n')
    .map((l) => {
      if (/^\s*(```|~~~)/.test(l)) {
        inFence = !inFence;
        return ' '.repeat(l.length);
      }
      return inFence ? ' '.repeat(l.length) : l;
    })
    .join('\n');
}

const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

export function findCitations(raw: string): Found {
  const text = maskFences(raw.replace(/\r\n/g, '\n'));

  const citations = [...text.matchAll(CITATION)].map((m) => ({
    path: m[1],
    symbols: [...m[2].matchAll(/`([^`]+)`/g)].map((s) => s[1]),
    commit: m[3],
    line: lineOf(text, m.index!),
    text: m[0].replace(/\s+/g, ' '),
  }));

  const lineNumbered = LINE_NUMBERED.flatMap((re) => [...text.matchAll(re)])
    .sort((a, b) => a.index! - b.index!)
    .map((m) => ({ line: lineOf(text, m.index!), text: m[0] }));

  const malformed = MALFORMED.flatMap((re) => [...text.matchAll(re)]).map((m) => ({
    line: lineOf(text, m.index!),
    text: m[0].trim(),
  }));

  // A comma after a citation makes what follows a symbol. A file path there is
  // almost always a second thing being listed, and it passes whenever the first
  // file happens to mention the second.
  const PATH_LIKE = /^[A-Za-z0-9_@.\-[\]]+(?:\/[A-Za-z0-9_@.\-[\]]+)+\.[A-Za-z]+$/;
  const pathsAsSymbols = citations.flatMap((c) =>
    c.symbols.filter((s) => PATH_LIKE.test(s)).map((s) => ({ line: c.line, text: `${c.path} › ${s}` }))
  );

  return { citations, lineNumbered, malformed: [...malformed, ...pathsAsSymbols] };
}

const git = (root: string, args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });

const reachable = new Map<string, boolean>();

/** Why the citation does not resolve, or null when it does. */
export function unresolved(root: string, c: Citation): string | null {
  if (c.path.startsWith('./') || c.path.startsWith('../') || c.path.startsWith('/')) {
    return `${c.path} is not repo-relative`;
  }

  let source: string;
  if (c.commit) {
    const key = `${root}\0${c.commit}`;
    if (!reachable.has(key)) {
      let ok = true;
      try {
        git(root, ['merge-base', '--is-ancestor', c.commit, 'HEAD']);
      } catch {
        ok = false;
      }
      reachable.set(key, ok);
    }
    if (!reachable.get(key)) {
      return `commit ${c.commit} is not reachable from HEAD (is history fetched?)`;
    }
    try {
      source = git(root, ['show', `${c.commit}:${c.path}`]);
    } catch {
      return `${c.path} does not exist at ${c.commit}`;
    }
  } else {
    const file = resolve(root, c.path);
    if (!existsSync(file) || !statSync(file).isFile()) return `${c.path} does not exist`;
    source = readFileSync(file, 'utf8');
  }

  source = source.replace(/\r\n/g, '\n');
  const missing = c.symbols.filter((s) => !source.includes(s.replace(/…$/, '')));
  if (missing.length > 0) {
    return `${c.path}${c.commit ? ` at ${c.commit}` : ''} does not contain ${missing.map((s) => `"${s}"`).join(', ')}`;
  }
  return null;
}
