#!/usr/bin/env node
/**
 * The built decision-service image, reproducing the reference engine over HTTP.
 * ADR-016, *Build first*.
 *
 *   node planes/execution/scripts/check-image.mjs <image> <database url>
 *
 * Starts the image against an empty database and requires it to refuse — a
 * service verifies the schema and never migrates it (ADR-016 §3.1) — then runs
 * the migration job from the image, twice, requiring the second run to apply
 * nothing (§3.2). Then seeds the database from the service bundle, starts the image against it
 * with a throwaway credential, waits for `/health`, sends all 60 service cases,
 * and fails naming every decision whose chain hash differs. Then checks the two
 * refusals an image must make: a request with no credential, and a start with
 * no credential at all.
 *
 * Requires Docker. The in-process conformance test proves the code; this proves
 * the image built from it, which is what gets deployed.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [image, databaseUrl] = process.argv.slice(2);
if (!image || !databaseUrl) {
  console.error('usage: check-image.mjs <image> <database url>');
  process.exit(2);
}

const token = randomBytes(24).toString('hex');
const port = 18080;
const name = `metis-execution-check-${process.pid}`;
const cases = JSON.parse(readFileSync(path.join(root, 'docs/conformance/service-cases.json'), 'utf8')).cases;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200) return res.json();
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  throw new Error(`the image did not become healthy within ${deadlineMs / 1000}s`);
}

/** The migration job, from the image under test. Its output is what an operator reads. */
function migrationJob(label) {
  const r = spawnSync(
    'docker',
    ['run', '--rm', '--network', 'host', '-e', `METIS_DATABASE_URL=${databaseUrl}`, image, 'node', '--import', 'tsx', 'src/migrate-job.ts'],
    { encoding: 'utf8', timeout: 120_000 }
  );
  const output = `${r.stdout}${r.stderr}`.trim();
  console.log(`migration job, ${label} (exit ${r.status}):\n${output}`);
  if (r.status !== 0) throw new Error(`the migration job failed ${label}`);
  return output;
}

async function main() {
  // An image never migrates on start: against a database no migration job has
  // touched, the service must refuse and name what has not run.
  const unmigrated = spawnSync(
    'docker',
    ['run', '--rm', '--network', 'host',
      '-e', `METIS_DATABASE_URL=${databaseUrl}`, '-e', `METIS_SERVICE_TOKEN=${token}`, '-e', 'METIS_DATA_CLASS=synthetic',
      image],
    { encoding: 'utf8', timeout: 60_000 }
  );
  const refusal = `${unmigrated.stdout}${unmigrated.stderr}`;
  if (unmigrated.status === 0 || !/BEHIND|has not run/.test(refusal)) {
    throw new Error(`the image did not refuse an unmigrated database:\n${refusal}`);
  }
  console.log(`refused to start against an unmigrated database: ${refusal.trim().split('\n').pop()}`);

  // Every store the first run migrated must be named again by the second, as
  // having nothing to apply. Compared by name, not by a count: a count pinned
  // here broke the day a fifth store was added (the key store, ADR-025), and
  // would have passed a second run that named a different store twice.
  const first = migrationJob('against an empty database');
  const migrated = [...first.matchAll(/^(\w+): applied /gm)].map((m) => m[1]);
  if (migrated.length === 0) throw new Error('the first migration job applied nothing to an empty database');
  const second = migrationJob('again, which must change nothing');
  const unchanged = [...second.matchAll(/^(\w+): at version \d+; nothing to apply$/gm)].map((m) => m[1]);
  if (/applied /.test(second) || unchanged.join(',') !== migrated.join(',')) {
    throw new Error(
      `the second migration job was not a no-op for every store: the first migrated ${migrated.join(', ')}; ` +
        `the second left unchanged ${unchanged.join(', ') || 'none'}`
    );
  }

  // Seeded after the job and in verify mode, so the seed proves the schema is
  // the release's rather than creating it.
  run('node', ['--import', 'tsx', 'planes/execution/scripts/seed-from-bundle.ts'], {
    cwd: root,
    env: { ...process.env, METIS_DATABASE_URL: databaseUrl, METIS_MIGRATIONS: 'verify' },
  });

  // Starts an image must refuse: no credential; a credential but no declared
  // data class (ADR-016 §4.1); and real data in PostgreSQL while the subject is
  // stored in clear (§4.2).
  const refuses = (label, env) => {
    const r = spawnSync('docker', ['run', '--rm', '--network', 'host', ...env.flatMap((e) => ['-e', e]), image], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (r.status === 0) throw new Error(`the image started ${label}`);
    console.log(`refused to start ${label}: ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
  };
  refuses('without METIS_SERVICE_TOKEN', [`METIS_DATABASE_URL=${databaseUrl}`, 'METIS_DATA_CLASS=synthetic']);
  refuses('without METIS_DATA_CLASS', [`METIS_DATABASE_URL=${databaseUrl}`, `METIS_SERVICE_TOKEN=${token}`]);
  refuses('with real data while the ledger stores the subject in clear', [
    `METIS_DATABASE_URL=${databaseUrl}`,
    `METIS_SERVICE_TOKEN=${token}`,
    'METIS_DATA_CLASS=real',
  ]);

  run('docker', [
    'run', '-d', '--rm', '--name', name, '--network', 'host',
    '-e', `METIS_DATABASE_URL=${databaseUrl}`,
    '-e', `METIS_SERVICE_TOKEN=${token}`,
    '-e', 'METIS_DATA_CLASS=synthetic',
    // The fixture connectors point at hosts that do not exist; the cases carry
    // every field those connectors would supply. See planes/execution/src/gateways.ts.
    '-e', 'METIS_INTEGRATIONS=caller-only',
    '-e', `PORT=${port}`,
    image,
  ]);

  try {
    const health = await waitHealthy(90_000);
    if (health.integrations !== 'caller-only') throw new Error(`health reports integrations '${health.integrations}', not caller-only`);
    if (health.dataClass !== 'synthetic') throw new Error(`health reports data class '${health.dataClass}', not synthetic`);
    console.log(`healthy: ${JSON.stringify(health.tenants.map((t) => ({ tenant: t.tenantId, flows: t.artifacts })))}`);

    const unauthorised = await fetch(`http://127.0.0.1:${port}/api/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ artifactId: cases[0].artifactId, request: cases[0].request }),
    });
    if (unauthorised.status !== 401) throw new Error(`a request with no credential got ${unauthorised.status}, not 401`);

    const failures = [];
    let offered = 0;
    for (const c of cases) {
      const res = await fetch(`http://127.0.0.1:${port}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ artifactId: c.artifactId, request: c.request }),
      });
      const body = await res.json();
      if (res.status !== 200) failures.push(`${c.expected.id}: HTTP ${res.status} ${body.message ?? body.error ?? ''}`);
      else if (body.chainHash !== c.expected.chainHash) failures.push(`${c.expected.id}: chain hash differs`);
      else if (c.expected.winner !== null) offered++;
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} of ${cases.length} decisions diverge:\n${failures.slice(0, 10).join('\n')}`);
    }
    if (offered === 0 || offered === cases.length) throw new Error('the cases did not exercise both arbitration and suppression');
    console.log(`the image reproduced ${cases.length} of ${cases.length} decisions (${offered} offered)`);
  } finally {
    spawnSync('docker', ['logs', name], { stdio: 'inherit' });
    spawnSync('docker', ['stop', name], { encoding: 'utf8' });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
