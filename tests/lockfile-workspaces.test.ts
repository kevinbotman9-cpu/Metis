import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The lockfile names only workspaces that exist. G-134.
 *
 * Until 2026-09-15 `package-lock.json` carried entries for fifteen workspace
 * directories deleted weeks earlier, one of them depending on `@metis/trace`,
 * which exists nowhere. `npm ci` installs what the lockfile says and never
 * re-resolves, so CI stayed green. `npm install` re-resolves, reached the
 * missing package and stopped — so nobody could add a dependency or a
 * workspace, and the decision service was built as a plain directory rather
 * than a workspace to get round it.
 *
 * Nothing noticed because nothing compared the lockfile with the tree. This
 * does, in both directions that matter: every workspace entry is a directory
 * with a package.json that npm manages, and every `@metis/*` link points at one.
 */

const root = path.resolve(__dirname, '..');
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { link?: boolean; resolved?: string; name?: string }>;
};
const workspaces: string[] = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).workspaces;

const isManaged = (dir: string) =>
  workspaces.some((w) =>
    w.endsWith('/*') ? dir.startsWith(w.slice(0, -1)) && !dir.slice(w.length - 1).includes('/') : dir === w
  );
const hasPackage = (dir: string) => existsSync(path.join(root, dir, 'package.json'));

describe('the lockfile and the workspaces on disk agree', () => {
  const entries = Object.entries(lock.packages).filter(([key]) => key !== '');
  const workspaceEntries = entries.filter(([key]) => !key.includes('node_modules/'));

  it('has workspace entries to check', () => {
    // A lockfile moved or reshaped would otherwise pass every assertion below.
    expect(workspaceEntries.length).toBeGreaterThan(5);
  });

  it('names no workspace directory that is not on disk', () => {
    const missing = workspaceEntries.map(([key]) => key).filter((key) => !hasPackage(key));
    expect(missing, 'lockfile entries for directories with no package.json — regenerate the lockfile').toEqual([]);
  });

  it('names no directory npm does not manage as a workspace', () => {
    const unmanaged = workspaceEntries.map(([key]) => key).filter((key) => !isManaged(key));
    expect(unmanaged, 'lockfile entries outside the root `workspaces` globs').toEqual([]);
  });

  it('links every @metis package to a workspace that exists', () => {
    const broken = entries
      .filter(([key, e]) => key.startsWith('node_modules/@metis/') && e.link)
      .filter(([, e]) => !e.resolved || !hasPackage(e.resolved))
      .map(([key, e]) => `${key} -> ${e.resolved}`);
    expect(broken).toEqual([]);
  });
});
