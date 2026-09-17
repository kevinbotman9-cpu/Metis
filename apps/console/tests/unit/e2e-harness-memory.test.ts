import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PlaywrightTestConfig } from '@playwright/test';
import seeded from '../../playwright.config';
import empty from '../../playwright.empty.config';
import bundle from '../../playwright.bundle.config';

/**
 * The suites' servers keep their stores in memory, whatever `.env.local` says.
 *
 * A person makes their own console durable by putting `METIS_DATABASE_URL` in
 * `apps/console/.env.local`. `next dev` and `next build` both load that file, and
 * so do the servers these suites start in the same directory. Left to it, a
 * harness server would open the person's database: `POST /api/_test/reset`
 * refuses a PostgreSQL catalogue, so every spec that resets fails; the seeded
 * warm-up finds no in-memory history; and the suite writes its decisions into
 * the history the person was keeping.
 *
 * `@next/env` applies a file's value only where the key is undefined in the
 * environment the process started with. Playwright starts each server with
 * `{ ...process.env, ...webServer.env }`. So `METIS_DATABASE_URL: ''` in
 * `webServer.env` is defined, the file loses, and every store reads `''` as
 * unset.
 *
 * Checked with Next's own loader rather than by reading the config, because
 * the rule being relied on is Next's, and a config value that looked right
 * while Next resolved something else is the failure this exists to catch.
 */

const nextEnv = createRequire(import.meta.url).resolve('@next/env', {
  paths: [path.dirname(createRequire(import.meta.url).resolve('next/package.json'))],
});

const DATABASE = 'postgres://someone:secret@localhost:5432/their_history';
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metis-env-local-'));
  fs.writeFileSync(path.join(dir, '.env.local'), `METIS_DATABASE_URL=${DATABASE}\n`);
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * What `METIS_DATABASE_URL` a Next process resolves in `dir`, started with the
 * environment Playwright would hand it.
 */
function resolvedDatabaseUrl(serverEnv: Record<string, string> | undefined, mode: 'development' | 'production') {
  const inherited: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    // Not what a person's shell carries: Vitest sets NODE_ENV=test, under which
    // Next skips `.env.local` altogether, and a processed-env marker makes the
    // loader return without reading a file.
    if (v === undefined || k === 'METIS_DATABASE_URL' || k === 'NODE_ENV' || k === '__NEXT_PROCESSED_ENV') continue;
    inherited[k] = v;
  }
  const env: NodeJS.ProcessEnv = { ...inherited, NODE_ENV: mode, ...(serverEnv ?? {}) };

  const script = [
    `const { loadEnvConfig } = require(${JSON.stringify(nextEnv)});`,
    `loadEnvConfig(process.cwd(), ${mode === 'development'}, { info() {}, error() {} });`,
    `process.stdout.write(JSON.stringify(process.env.METIS_DATABASE_URL ?? null));`,
  ].join('\n');
  const run = spawnSync(process.execPath, ['-e', script], { cwd: dir, env, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`env probe failed: ${run.stderr}`);
  return JSON.parse(run.stdout) as string | null;
}

const serverOf = (config: PlaywrightTestConfig) =>
  (Array.isArray(config.webServer) ? config.webServer[0] : config.webServer)!;

describe('a harness server does not open the database a person configured', () => {
  it('reads the file for a console started by hand, so the checks below are about something', () => {
    // Without this, a probe that never loaded `.env.local` would pass every
    // case below.
    expect(resolvedDatabaseUrl(undefined, 'development')).toBe(DATABASE);
    expect(resolvedDatabaseUrl(undefined, 'production')).toBe(DATABASE);
  });

  it.each([
    ['the seeded suite', seeded, 'development'],
    ['the empty-ledger suite', empty, 'development'],
    ['the bundle budget', bundle, 'production'],
  ] as const)('%s runs its stores in memory', (_name, config, mode) => {
    // Falsy is what every store factory reads as "no database".
    expect(resolvedDatabaseUrl(serverOf(config).env, mode)).toBeFalsy();
  });
});
