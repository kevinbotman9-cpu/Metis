import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { DecisionLedger, InMemoryLedgerStore } from '@metis/ledger';
import { json, wrongAnswers } from './helpers';
import { createService } from '../src/server';
import { loadTenants, type LoadResult } from '../src/state';
import { readCases, seedFromBundle } from './seed';

/**
 * The decision service reproducing decisions the reference engine made, over
 * HTTP. ADR-016, *Build first*: "sends the 60 service cases over HTTP,
 * asserting every chain hash, as `ServiceConformanceTest` does for the JVM
 * service."
 *
 * The cases are real decisions from the console's flows and catalogue, a
 * spread of offered and suppressed. A service that loaded the catalogue
 * unfaithfully, dropped a request field, reordered the pipeline or resolved a
 * connector it should have skipped gives a different chain hash, and this
 * fails naming the decision.
 */

const TOKEN = 'conformance-credential';

let server: Server;
let base: string;
let loaded: LoadResult | null = null;
const cases = readCases();

beforeAll(async () => {
  const seeded = await seedFromBundle();
  server = createService({
    token: TOKEN,
    loaded: () => loaded,
    ledger: new DecisionLedger(new InMemoryLedgerStore()),
    gateway: wrongAnswers,
    integrations: 'live',
    dataClass: 'synthetic',
    now: () => '2026-09-14T12:00:00.000Z',
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  loaded = await loadTenants({
    catalogueStore: seeded.catalogueStore,
    registry: seeded.registry,
    environment: 'production',
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('the decision service reproduces the reference engine', () => {
  it('every one of the service cases, byte for byte', async () => {
    expect(cases.length).toBe(60);
    const failures: string[] = [];
    let offered = 0;

    for (const c of cases) {
      const res = await fetch(`${base}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ artifactId: c.artifactId, request: c.request }),
      });
      const body = await json(res);
      if (res.status !== 200) {
        failures.push(`${c.expected.id}: HTTP ${res.status} ${body.message ?? body.error ?? ''}`);
        continue;
      }
      if (body.chainHash !== c.expected.chainHash) {
        failures.push(
          `${c.expected.id}: chain hash differs — winner expected ${c.expected.winner} got ${body.decision?.winner}; ` +
            `input ${c.expected.inputSnapshotHash.slice(0, 16)} vs ${String(body.decision?.inputSnapshotHash).slice(0, 16)}; ` +
            `catalogue ${c.expected.catalogueSnapshotHash.slice(0, 16)} vs ${String(body.decision?.catalogueSnapshotHash).slice(0, 16)}`
        );
        continue;
      }
      expect(body.id).toBe(c.expected.id);
      expect(body.decision?.winner).toBe(c.expected.winner);
      if (c.expected.winner !== null) offered++;
    }

    expect(failures, `${failures.length} of ${cases.length} decisions diverge`).toEqual([]);
    // A run where nothing is offered, or everything is, exercises only half the
    // engine: arbitration, or suppression.
    expect(offered).toBeGreaterThan(0);
    expect(offered).toBeLessThan(cases.length);
  });
});
