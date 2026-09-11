#!/usr/bin/env node
/**
 * Writes mocks/fixtures/decision-index.json: one flat row per decision.
 *
 * The console needs two different things from its decision history, and they
 * have very different costs. The grid, the search, the facets and every chart
 * need a row per decision and nothing more — id, when, which channel, what won.
 * The trace reader needs the whole cascade, and only for the one decision
 * somebody opened.
 *
 * Generating everything up front served the first and made the second free, at
 * a price that grew until it was not worth paying: about thirteen seconds on
 * every import, and 80 MB of traces held in memory to answer questions almost
 * none of them were asked. This writes the rows once — 1.5 MB, committed — and
 * `executeAt` in mocks/fixtures/engine.ts re-runs the engine for a trace when
 * one is actually opened.
 *
 * Both halves come from the same deterministic generator, so a row here and the
 * trace re-executed for it are the same decision. `tests/unit/decision-index.test.ts`
 * fails when they disagree.
 *
 * Run: npm run generate  (in apps/console)
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../mocks/fixtures/decision-index.json');

const { executeAt, DECISION_COUNT } = await import('../mocks/fixtures/engine.ts');

/**
 * Column order. Positional rather than an object per row: the same 10,400
 * decisions are 3.1 MB as objects and 1.5 MB as arrays, and the key names are
 * the difference. `COLUMNS` is the contract between this file and the reader.
 */
export const COLUMNS = [
  // Where in the generator this decision came from. The index is sorted
  // newest-first for display, which is not the order the seed produces, so
  // without this a reader would have to execute the whole corpus to learn
  // which slot an id belongs to — which is the cost the index exists to avoid.
  'slot',
  'id',
  'artifactId',
  'artifactVersion',
  'customerId',
  'timestamp',
  'channel',
  'placement',
  'winner',
  'winnerOfferId',
  'candidateCount',
  // No latency column. One was here until 2026-09-11: a stopwatch reading of
  // this script, frozen on whichever machine last ran it, so the file never
  // regenerated to the same bytes, and the screens presented it as platform
  // performance (G-052). A decision's duration is on its trace, measured when
  // the trace is re-executed.
  'chainHash',
];

const rows = [];
for (let i = 0; i < DECISION_COUNT; i++) {
  const { trace } = executeAt(i);
  const d = trace.decision;
  rows.push([
    i,
    trace.id,
    d.artifactId,
    d.artifactVersion,
    d.customerRef,
    d.occurredAt,
    d.channel,
    d.placement,
    d.winner,
    d.winnerOfferId,
    d.candidateKeys.length,
    trace.chainHash,
  ]);
}

// Newest first, which is the order every screen reads them in.
rows.sort((a, b) => String(b[5]).localeCompare(String(a[5])));

const next = JSON.stringify({ columns: COLUMNS, rows });
const prev = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;

if (prev === next) {
  console.log(`decision-index.json is current (${rows.length} decisions)`);
} else {
  writeFileSync(OUT, next);
  const mb = (Buffer.byteLength(next) / 1048576).toFixed(1);
  console.log(`wrote ${OUT} — ${rows.length} decisions, ${mb} MB`);
}
