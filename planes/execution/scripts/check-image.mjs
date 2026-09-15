#!/usr/bin/env node
/**
 * The built decision-service image, reproducing the reference engine over HTTP.
 * ADR-016, *Build first*.
 *
 *   node planes/execution/scripts/check-image.mjs <image> <database url>
 *
 * Seeds an empty database from the service bundle, starts the image against it
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

async function main() {
  run('node', ['--import', 'tsx', 'planes/execution/scripts/seed-from-bundle.ts'], {
    cwd: root,
    env: { ...process.env, METIS_DATABASE_URL: databaseUrl },
  });

  // An image started without the credential must refuse to start.
  const bare = spawnSync('docker', ['run', '--rm', '--network', 'host', '-e', `METIS_DATABASE_URL=${databaseUrl}`, image], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (bare.status === 0) throw new Error('the image started without METIS_SERVICE_TOKEN');

  run('docker', [
    'run', '-d', '--rm', '--name', name, '--network', 'host',
    '-e', `METIS_DATABASE_URL=${databaseUrl}`,
    '-e', `METIS_SERVICE_TOKEN=${token}`,
    // The fixture connectors point at hosts that do not exist; the cases carry
    // every field those connectors would supply. See planes/execution/src/gateways.ts.
    '-e', 'METIS_INTEGRATIONS=caller-only',
    '-e', `PORT=${port}`,
    image,
  ]);

  try {
    const health = await waitHealthy(90_000);
    if (health.integrations !== 'caller-only') throw new Error(`health reports integrations '${health.integrations}', not caller-only`);
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
