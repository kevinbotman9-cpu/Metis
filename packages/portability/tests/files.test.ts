import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { exportTenant, writeBundle, readBundle, verifyBundle, PortabilityError } from '../src';
import { TENANT, populatedInstance } from './fixtures';

/**
 * A bundle on disk survives the trip.
 *
 * Separate from the in-memory round trip because serialisation is its own
 * opportunity to lose something — an undefined that JSON drops, a number that
 * changes shape — and the in-memory test would not see any of it.
 */

const AT = '2026-09-06T10:00:00.000Z';
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'metis-bundle-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('a bundle written to disk', () => {
  it('reads back identically and still verifies', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });
    const dir = tempDir();

    writeBundle(bundle, dir);
    const reloaded = readBundle(dir);

    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(bundle));
    expect(verifyBundle(reloaded)).toEqual([]);
  });

  it('is readable by a person, not only by this code', async () => {
    // §9's phrase is "without professional-services intervention". A customer
    // opening decision_records.json in an editor is most of what that means.
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });
    const dir = tempDir();
    writeBundle(bundle, dir);

    const raw = readFileSync(resolve(dir, 'decision_records.json'), 'utf8');
    expect(raw).toContain('\n  {');
    expect(JSON.parse(raw)).toHaveLength(bundle.decision_records.length);
  });

  it('refuses a directory with a manifest but no files', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });
    const dir = tempDir();
    writeBundle(bundle, dir);

    unlinkSync(resolve(dir, 'outcome_events.json'));

    // Importing four of five files would produce a tenant that looks whole.
    expect(() => readBundle(dir)).toThrow(PortabilityError);
    expect(() => readBundle(dir)).toThrow(/outcome_events\.json is missing/);
  });

  it('refuses a directory with no manifest', () => {
    const dir = tempDir();
    writeFileSync(resolve(dir, 'decision_records.json'), '[]', 'utf8');
    expect(() => readBundle(dir)).toThrow(/cannot be checked/);
  });
});
