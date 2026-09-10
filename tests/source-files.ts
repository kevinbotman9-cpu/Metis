import { execFileSync } from 'node:child_process';

/**
 * Every file in the working tree a check should scan.
 *
 * The union of what git tracks and what it would track — `git ls-files` plus
 * `git ls-files --others --exclude-standard` — so a file that exists but has
 * not been committed is scanned like any other. Ignored files stay ignored:
 * `--exclude-standard` applies `.gitignore`, so `node_modules`, `.next` and
 * build output are not swept in.
 *
 * **Why this exists.** Three checks read `git ls-files` alone, and an untracked
 * file was invisible to all three. `tests/vocabulary.test.ts` documented that
 * as deliberate — *"the check guards what the repo actually carries"* — which
 * is true of a CI run, where everything is committed by definition, and wrong
 * about the run that matters. The author is standing at a local `npm test` with
 * the file they just wrote still untracked, and that is precisely when a check
 * is worth something: it is the only moment the fix is one edit rather than a
 * rewrite of a commit.
 *
 * G-048 is what it cost. `placement-form-dialog.tsx` used a word the platform
 * was renamed away from; the slice that introduced it ran the vocabulary check
 * and went green because the file was untracked at the time. It was reworded on
 * a later branch, which fixed the tip and left the defect at the commit that
 * introduced it, and it surfaced four slices later while merging a stack — in a
 * PR about something else entirely, where it cost a red gate and a detour.
 *
 * A check that can only see committed files reports the past. These read the
 * tree in front of you.
 */

/** A guard on the guard: an empty list would make every caller pass vacuously. */
const FLOOR = 50;

export function sourceFiles(root: string): string[] {
  const run = (args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32e6 })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

  const tracked = run(['ls-files']);
  // Untracked and not ignored — the new file the author has not committed yet.
  const untracked = run(['ls-files', '--others', '--exclude-standard']);

  const all = [...new Set([...tracked, ...untracked])].sort();

  if (all.length < FLOOR) {
    throw new Error(
      `git listed ${all.length} files, which cannot be right — every check over this list would pass vacuously`
    );
  }
  return all;
}
