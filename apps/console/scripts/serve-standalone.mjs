#!/usr/bin/env node
/**
 * Serve the production build the way it actually deploys.
 *
 * `next start` refuses to serve an `output: 'standalone'` build — it prints a
 * warning and serves something else. The bundle budget check ran against that
 * for one commit and measured 0 kB on every route, which is the failure this
 * whole work item is about: a check that appears to run and does not.
 *
 * Standalone also does not copy `.next/static` or `public` into its own tree;
 * the Next docs make that the caller's job. Without it the server answers HTML
 * and 404s every script, which again measures as zero rather than as an error.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const consoleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = resolve(consoleDir, '.next/standalone/apps/console');
const server = resolve(standalone, 'server.js');

if (!existsSync(server)) {
  console.error(
    `No standalone build at ${server}. Run \`next build\` first — this script serves a build, it does not make one.`
  );
  process.exit(1);
}

for (const [from, to] of [
  [resolve(consoleDir, '.next/static'), resolve(standalone, '.next/static')],
  [resolve(consoleDir, 'public'), resolve(standalone, 'public')],
]) {
  if (!existsSync(from)) continue;
  // Replaced rather than merged: a stale chunk left from an earlier build is
  // exactly the kind of thing that makes a size measurement quietly wrong.
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

const port = process.env.PORT ?? '3100';
spawn(process.execPath, [server], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, HOSTNAME: '127.0.0.1' },
}).on('exit', (code) => process.exit(code ?? 0));
