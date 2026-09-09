import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import { execute, replay } from '../src/deterministic/engine';
import type {
  CatalogueSnapshot,
  DecisionRequest,
  ExecArtifact,
} from '../src/deterministic/types';
import type { Offer } from '@metis/core/domain';

/**
 * The decision path reaches no network.
 *
 * §13's fourth exit criterion is "no LLM dependency". It has been true in fact
 * since the beginning and guarded by nothing, which is the weakest kind of
 * true: nobody would notice the day it stopped being so, because a model call
 * added inside a node would simply make decisions slower and less
 * reproducible rather than failing anything.
 *
 * It is also the claim a technical evaluation probes first, and "we checked
 * and there are no HTTP calls" is a much weaker answer than a test that fails
 * if one appears.
 *
 * **The boundary this asserts.** The deterministic core — `execute` and
 * `replay` — makes no outbound connection of any kind. Integration resolution
 * is deliberately outside that boundary: connectors are fetched *before* the
 * core runs, their output is hashed into the input snapshot, and replay reads
 * the snapshot rather than calling them again. That split is what makes a
 * decision reproducible while still reading live data, so this test guards the
 * core rather than pretending the platform never talks to anything.
 */

const gbp = (amount: number) => ({ amount, currency: 'GBP' as const });

const offer = (over: Partial<Offer> & { id: string; key: string }): Offer =>
  ({
    categoryId: 'g1',
    objectiveId: 'i1',
    name: over.id,
    description: '',
    status: 'active',
    financials: {
      price: gbp(1000),
      cost: gbp(400),
      expectedMargin: gbp(600),
      termMonths: 12,
      oneOff: false,
    },
    validity: { startsAt: '2020-01-01', endsAt: null },
    boost: 1,
    policyIds: [],
    creativeIds: ['t1'],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
    ...over,
  }) as Offer;

const catalogue: CatalogueSnapshot = {
  offers: [
    offer({ id: 'p1', key: 'upsell_5g' }),
    offer({ id: 'p2', key: 'upsell_data', boost: 1.4 }),
  ],
  targetingPolicies: [],
  frequencyPolicies: [],
  arbitration: {
    id: 'arb',
    tenantId: 'telco-uk',
    weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'P x V x B x C',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
  },
  boosts: [],
  connectors: [],
} as unknown as CatalogueSnapshot;

const artifact: ExecArtifact = {
  id: 'next-best-action',
  version: '2.4.0',
  tenantId: 'telco-uk',
  candidateKeys: ['upsell_5g', 'upsell_data'],
  packageVersions: { '@metis/nodes-core': '1.2.0' },
  nodes: [
    { id: 'source', type: 'source', label: 'Customer profile' },
    { id: 'eligibility', type: 'filter', label: 'Eligibility' },
    { id: 'score', type: 'score-adaptive', label: 'Propensity', model: { id: 'adm', version: '4.2.0' } },
    { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate' },
  ],
  edges: [
    { from: 'source', to: 'eligibility' },
    { from: 'eligibility', to: 'score' },
    { from: 'score', to: 'arbitrate' },
  ],
} as unknown as ExecArtifact;

const request: DecisionRequest = {
  tenantId: 'telco-uk',
  customerId: 'cust_egress',
  channel: 'email',
  placement: 'weekly_offers',
  occurredAt: '2026-06-01T12:00:00.000Z',
  input: { age: 41, tenureMonths: 30 },
  consent: { marketing: true, profiling: true, thirdParty: false },
};

/**
 * Every way out of the process, closed.
 *
 * Blocked at the module level rather than by inspecting code, because the
 * point is to catch a call nobody remembered to look for — a transitive
 * dependency, a polyfill, an SDK someone imported for one helper.
 */
interface Blocker {
  attempts: string[];
  restore: () => void;
}

function blockNetwork(): Blocker {
  const attempts: string[] = [];
  const record = (how: string) => (...args: unknown[]) => {
    const target = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
    attempts.push(`${how} ${target}`);
    throw new Error(`Network blocked: ${how} ${target}`);
  };

  const originals = {
    fetch: globalThis.fetch,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    netConnect: net.connect,
    socketConnect: net.Socket.prototype.connect,
    dnsLookup: dns.lookup,
    dnsResolve: dns.resolve,
  };

  globalThis.fetch = record('fetch') as unknown as typeof fetch;
  http.request = record('http.request') as unknown as typeof http.request;
  http.get = record('http.get') as unknown as typeof http.get;
  https.request = record('https.request') as unknown as typeof https.request;
  https.get = record('https.get') as unknown as typeof https.get;
  net.connect = record('net.connect') as unknown as typeof net.connect;
  // The one that catches a client library which built its own socket rather
  // than going through http/https.
  net.Socket.prototype.connect = record('socket.connect') as unknown as typeof net.Socket.prototype.connect;
  dns.lookup = record('dns.lookup') as unknown as typeof dns.lookup;
  dns.resolve = record('dns.resolve') as unknown as typeof dns.resolve;

  return {
    attempts,
    restore() {
      globalThis.fetch = originals.fetch;
      http.request = originals.httpRequest;
      http.get = originals.httpGet;
      https.request = originals.httpsRequest;
      https.get = originals.httpsGet;
      net.connect = originals.netConnect;
      net.Socket.prototype.connect = originals.socketConnect;
      dns.lookup = originals.dnsLookup;
      dns.resolve = originals.dnsResolve;
    },
  };
}

let blocker: Blocker;

beforeEach(() => {
  blocker = blockNetwork();
});

afterEach(() => {
  blocker.restore();
});

describe('the decision path makes no outbound connection', () => {
  it('decides successfully with the network blocked', () => {
    // Not "does not throw" — a real decision, with a winner, so a future
    // engine that swallowed a network failure and returned nothing would
    // still fail here.
    const record = execute(artifact, catalogue, request);

    expect(record.decision.winner).toBeTruthy();
    expect(record.chainHash).toMatch(/^[0-9a-f]{64}$/);
    expect(blocker.attempts).toEqual([]);
  });

  it('replays with the network blocked', () => {
    // Replay is the half a regulator exercises, often years later and often
    // somewhere with no route to the original data sources at all.
    const record = execute(artifact, catalogue, request);
    const result = replay(artifact, catalogue, record, request.input);

    expect(result.identical).toBe(true);
    expect(blocker.attempts).toEqual([]);
  });

  it('blocks what it claims to block', () => {
    // A guard on the guard. If the blocker silently stopped intercepting, the
    // two assertions above would pass by measuring nothing — which is exactly
    // how the bundle-size check shipped green while reading zero bytes.
    //
    // `fetch` is asserted first and deliberately. The earlier version of this
    // test checked only http and net — both module-level patches — and would
    // have kept passing if the fetch patch never reached the engine's scope,
    // which is precisely the call a model would use.
    expect(() => fetch('https://example.com')).toThrow(/Network blocked/);
    expect(() => http.request('http://example.com')).toThrow(/Network blocked/);
    expect(() => net.connect(80, 'example.com')).toThrow(/Network blocked/);
    expect(blocker.attempts.length).toBe(3);
  });

  it('runs the same decision to the same hash whether blocked or not', () => {
    const blocked = execute(artifact, catalogue, request);
    blocker.restore();
    const open = execute(artifact, catalogue, request);

    // If blocking the network changed an answer, something in the path was
    // reaching for it and quietly degrading.
    expect(blocked.chainHash).toBe(open.chainHash);
  });
});
