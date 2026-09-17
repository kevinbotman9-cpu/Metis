import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * `.env.local.example` says what a local console can be told, and copying it
 * changes nothing.
 *
 * Until 2026-09-17 it set `NEXT_PUBLIC_USE_MSW=true` and a fixed API base, and
 * named three variables nothing reads. Copying it — the obvious first step when
 * told to create `.env.local` for a database — would have started a Mock Service
 * Worker answering twenty operations from fixtures, beside the database the
 * person had just configured, with nothing on screen to say so. It had not
 * mentioned `METIS_DATABASE_URL` at all.
 *
 * Nothing checked it, which is how it drifted. These do, in both directions.
 */

const CONSOLE = path.resolve(__dirname, '../..');
const ROOT = path.resolve(CONSOLE, '../..');
const EXAMPLE = fs.readFileSync(path.join(CONSOLE, '.env.local.example'), 'utf8').replace(/\r\n/g, '\n');

/** Source a local console runs: the app, its mocks and scripts, and the packages it opens. */
function sources(): { file: string; text: string }[] {
  const roots = ['app', 'lib', 'mocks', 'components', 'scripts'].map((d) => path.join(CONSOLE, d));
  for (const pkg of fs.readdirSync(path.join(ROOT, 'packages'))) {
    const src = path.join(ROOT, 'packages', pkg, 'src');
    if (fs.existsSync(src)) roots.push(src);
  }
  const files: string[] = [path.join(CONSOLE, 'next.config.js')];
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { recursive: true }) as string[]) {
      if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(path.join(root, entry));
    }
  }
  return files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
}

const SOURCES = sources();
const HARNESS = ['playwright.config.ts', 'playwright.empty.config.ts', 'playwright.bundle.config.ts'].map((f) =>
  fs.readFileSync(path.join(CONSOLE, f), 'utf8')
);

/** Every `# NAME=` the example documents. */
const documented = [...EXAMPLE.matchAll(/^#\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);

describe('.env.local.example', () => {
  it('sets nothing, so copying it unchanged changes nothing', () => {
    const live = EXAMPLE.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
    expect(live, 'an uncommented line in the example takes effect the moment it is copied').toEqual([]);
  });

  it('documents the variables it is meant to', () => {
    // Without this the two checks below pass over an empty file.
    expect(documented).toEqual(expect.arrayContaining(['METIS_DATABASE_URL', 'NEXT_PUBLIC_USE_MSW']));
  });

  it('names only variables something reads', () => {
    const unread = documented.filter(
      (name) => !SOURCES.some((s) => new RegExp(`\\b${name}\\b`).test(s.text)) && !HARNESS.some((h) => h.includes(name))
    );
    expect(unread, 'documented, and read by nothing').toEqual([]);
  });

  it('documents every METIS_ and NEXT_PUBLIC_ variable the console and its packages read', () => {
    const read = new Set<string>();
    for (const s of SOURCES) {
      for (const m of s.text.matchAll(/\benv\.((?:METIS|NEXT_PUBLIC)_[A-Z0-9_]+)/g)) read.add(m[1]);
    }
    expect(read.size, 'found no variables; has the source layout moved?').toBeGreaterThan(5);
    expect([...read].filter((name) => !documented.includes(name)).sort(), 'read, and not in the example').toEqual([]);
  });

  it('counts the operations the mock worker answers as the handlers do', () => {
    // The sentence that says what NEXT_PUBLIC_USE_MSW=true does names a number,
    // and a number in prose is a number that goes stale.
    const handlers = fs.readFileSync(path.join(CONSOLE, 'mocks/handlers.ts'), 'utf8');
    const count = [...handlers.matchAll(/\bhttp\.(get|post|put|patch|delete)\(/g)].length;
    const stated = /answers (\d+) API\s*\n?#?\s*operations/.exec(EXAMPLE);
    expect(stated, 'the example no longer states how many operations the worker answers').not.toBeNull();
    expect(Number(stated![1])).toBe(count);
  });
});
