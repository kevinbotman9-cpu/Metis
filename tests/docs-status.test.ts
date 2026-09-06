import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Only the capability map says what is built.
 *
 * `docs/CAPABILITIES.md` exists because three documents made the same status
 * claim and all three had drifted: README called the decision ledger,
 * idempotency and shadow mode unbuilt three stages after they were built,
 * `gaps.md` said 26 operations when the spec said 39, and the console status
 * file understated the suite by 172 tests. Consolidating them fixed that
 * moment. Nothing stopped it recurring, which is what this is for.
 *
 * The check is deliberately narrow: a **table row whose status cell asserts
 * completion**. That is how a capability claim is actually made — the README
 * table that went stale had exactly this shape — and it does not fire on prose
 * that merely mentions the word, including the several places that quote the
 * deleted `PHASES_SUMMARY.md` in order to explain why it was deleted.
 */

const root = resolve(__dirname, '..');

/**
 * Documents allowed to assert status, and why each is not a second capability
 * map. If this list grows, the drift it prevents grows back.
 */
const STATUS_DOCUMENTS = new Map([
  ['docs/CAPABILITIES.md', 'The capability map. The single claim, by design.'],
  [
    'docs/EXPERIENCE_LAYER_STATUS.md',
    'Console routes, one row each — a different subject from platform capability, and the map points at it.',
  ],
  ['docs/BACKLOG.md', 'Records which work items are done, which is history rather than a status claim.'],
]);

/** A status cell asserting the thing is finished. */
const CLAIM = /^(built|complete|completed|done|shipped|✅.*)$/i;

function markdownFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.name.endsWith('.md')) found.push(rel);
    }
  };
  walk(resolve(root, 'docs'), 'docs');
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) found.push(entry.name);
  }
  return found;
}

describe('only the capability map claims things are built', () => {
  it('finds the documents it is checking', () => {
    // Without this, a moved docs tree makes the assertion below pass by
    // scanning nothing.
    const files = markdownFiles();
    expect(files.length, 'no markdown found; has the docs tree moved?').toBeGreaterThan(5);
    expect(files).toContain('README.md');
    expect(files).toContain('docs/CAPABILITIES.md');
  });

  it('no other document asserts a capability is built', () => {
    const offenders: string[] = [];

    for (const file of markdownFiles()) {
      if (STATUS_DOCUMENTS.has(file)) continue;

      const lines = readFileSync(resolve(root, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return;

        const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
        // A separator row, not a claim.
        if (cells.every((c) => /^:?-+:?$/.test(c))) return;

        const last = cells[cells.length - 1]?.replace(/\*\*/g, '').trim() ?? '';
        if (CLAIM.test(last)) {
          offenders.push(`${file}:${i + 1} — "${trimmed.slice(0, 90)}"`);
        }
      });
    }

    expect(
      offenders,
      'A status table outside docs/CAPABILITIES.md is a second claim about ' +
        'what is built, and the second claim is the one that goes stale. Move ' +
        'the row into the capability map and link to it.'
    ).toEqual([]);
  });

  it('every allowed status document exists and says why it is allowed', () => {
    for (const [file, reason] of STATUS_DOCUMENTS) {
      expect(() => readFileSync(resolve(root, file), 'utf8'), `${file} is missing`).not.toThrow();
      expect(reason.length, `${file} has no stated reason`).toBeGreaterThan(20);
    }
  });
});
