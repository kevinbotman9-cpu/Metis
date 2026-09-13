import fs from 'node:fs';
import path from 'node:path';

/**
 * Ticket and decision-record ids in text a person reads on screen.
 *
 * The console is read by a decisioning architect at a carrier, who has no access
 * to this repository's backlog, gap register or ADRs. "W-017, blocked on W-008.
 * ADR-013." tells that reader nothing, and on 2026-09-13 a prose pass found 22 of
 * them rendered: in paragraphs, in `Absent` reasons, in a disabled button's title
 * and in form help. The reason behind an id — "no recipient address in the profile
 * schema" — is what belongs on the screen; the id belongs in the register.
 *
 * Comments are exempt, and so are the registers themselves: that is where an id
 * is the point. So the scan blanks every comment before it looks, keeping the
 * line breaks so a finding still points at its source line.
 *
 * A pure function over a root directory, so it can be pointed at an older
 * checkout to prove it would have caught what it was written for.
 */

export interface TicketIdOffender {
  file: string;
  line: number;
  id: string;
  text: string;
}

/** Where screen text is written. */
export const SCANNED = ['app', 'components'] as const;

const ID = /\b(?:W|G|ADR)-\d+\b/g;

/**
 * The source with every comment replaced by spaces, line breaks kept.
 *
 * A scanner rather than two regular expressions, because the expressions are
 * wrong in both directions here: a string holding `app/**` opens a block comment
 * that swallows the code after it, and `https://` in JSX text opens a line
 * comment. Quotes are tracked so a comment marker inside a string is left alone,
 * and a `//` straight after a colon is read as a URL, not a comment.
 */
export function stripComments(src: string): string {
  let out = '';
  let quote: string | null = null;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      if (c === '\\') {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      // A single- or double-quoted string cannot cross a line, so a stray
      // apostrophe in JSX text stops being a string at the end of its line.
      if (c === quote || (c === '\n' && quote !== '`')) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\r\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '/' && next === '/' && src[i - 1] !== ':') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += src.slice(i, stop).replace(/[^\r]/g, ' ');
      i = stop;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

/** Every id outside a comment in one source text, with its 1-based line. */
export function idsIn(src: string): { line: number; id: string; text: string }[] {
  const found: { line: number; id: string; text: string }[] = [];
  const original = src.split(/\r?\n/);
  stripComments(src)
    .split(/\r?\n/)
    .forEach((code, i) => {
      for (const m of code.matchAll(ID)) found.push({ line: i + 1, id: m[0], text: original[i].trim() });
    });
  return found;
}

function files(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const d of SCANNED) walk(path.join(root, d));
  return out;
}

/** Every rendered-text id under `root` (an `apps/console` directory), in file and line order. */
export function ticketIdOffenders(root: string): TicketIdOffender[] {
  return files(root).flatMap((full) => {
    const file = path.relative(root, full).split(path.sep).join('/');
    return idsIn(fs.readFileSync(full, 'utf8')).map((o) => ({ file, ...o }));
  });
}
