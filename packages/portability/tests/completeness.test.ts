import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENTITIES, EXPORTED_ENTITIES } from '../src/entities';
import { exportTenant } from '../src/export';
import { TENANT, populatedInstance } from './fixtures';

/**
 * The guard that stops export rotting.
 *
 * An export is only a differentiator while it is complete, and completeness is
 * exactly the property that decays silently: someone adds a table, the export
 * keeps passing every test it has, and the omission surfaces years later when
 * a customer tries to leave. By then it is not a bug report, it is the
 * headline claim being false.
 *
 * So the source of truth is not a list someone maintains. It is the migrations
 * — the tables that actually exist — and every one of them must be either
 * exported or explicitly declared as excluded with a reason.
 */

const root = resolve(__dirname, '../../..');

/**
 * Every migration in the repository, discovered rather than listed.
 *
 * This was a hardcoded pair of paths, and `packages/catalogue` — a whole new
 * package with eight tables — walked straight past it. A guard against
 * forgetting that itself has to be remembered is not a guard.
 */
function migrationFiles(): string[] {
  const packagesDir = resolve(root, 'packages');
  const found: string[] = [];
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const dir = resolve(packagesDir, pkg.name, 'migrations');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.sql')) found.push(resolve(dir, file));
    }
  }
  return found.sort();
}

function tablesInMigrations(): string[] {
  const found = new Set<string>();
  for (const file of migrationFiles()) {
    // Comments stripped first: the migrations discuss `CREATE TABLE IF NOT
    // EXISTS` in prose, and matching that captured the word "if" as a table.
    const sql = readFileSync(file, 'utf8').replace(/--.*$/gm, '');
    // The opening paren is required, so only a real definition matches.
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\(/gi
    )) {
      found.add(m[1].toLowerCase());
    }
  }
  return [...found].sort();
}

describe('the export knows about everything that is persisted', () => {
  it('finds the migrations it is checking against', () => {
    // Without this, a moved migration file makes every assertion below pass by
    // finding nothing — the failure mode this whole file exists to prevent.
    expect(
      migrationFiles().length,
      'no migrations discovered; has the packages tree moved?'
    ).toBeGreaterThan(1);
    const tables = tablesInMigrations();
    expect(tables.length, 'no CREATE TABLE found; have the migrations moved?').toBeGreaterThan(4);
  });

  it('has a decision recorded for every persisted table', () => {
    const declared = new Set(ENTITIES.map((e) => e.table));
    const undeclared = tablesInMigrations().filter((t) => !declared.has(t));

    expect(
      undeclared,
      'These tables exist and the export says nothing about them. Add each to ' +
        'ENTITIES — either exported, or excluded with a reason someone can ' +
        'read. Leaving it undecided is how an export stops being complete.'
    ).toEqual([]);
  });

  it('declares nothing that does not exist', () => {
    const tables = new Set(tablesInMigrations());
    const phantom = ENTITIES.map((e) => e.table).filter((t) => !tables.has(t));
    expect(phantom, 'ENTITIES names tables no migration creates').toEqual([]);
  });

  it('gives a reason for every exclusion', () => {
    const unexplained = ENTITIES.filter((e) => !e.included && !e.reason?.trim()).map(
      (e) => e.table
    );
    // An exclusion without a reason is indistinguishable from an oversight,
    // which is the thing being guarded against.
    expect(unexplained).toEqual([]);
  });

  it('carries every declared entity into the bundle, with its rows', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, {
      tenantId: TENANT,
      exportedAt: '2026-09-06T10:00:00.000Z',
    });

    expect(bundle.manifest.files.map((f) => f.entity).sort()).toEqual(
      [...EXPORTED_ENTITIES].sort()
    );

    // Every declared entity is populated by the fixture, so a manifest entry
    // reporting zero rows means the export is not reading that store — the
    // shape a "complete" export takes when it is quietly broken.
    for (const file of bundle.manifest.files) {
      expect(file.count, `${file.entity} exported no rows`).toBeGreaterThan(0);
    }
  });

  it('tells the recipient what was left out', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, {
      tenantId: TENANT,
      exportedAt: '2026-09-06T10:00:00.000Z',
    });

    // The exclusions travel with the bundle. Someone importing it elsewhere
    // should not have to read our source to learn what they did not receive.
    expect(bundle.manifest.excluded.map((e) => e.entity)).toEqual(['idempotency_keys']);
    expect(bundle.manifest.excluded[0].reason.length).toBeGreaterThan(40);
  });
});
