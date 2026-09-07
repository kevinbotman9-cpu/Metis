import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  HttpIntegrationGateway,
  MemoryIntegrationCache,
} from '../src/integration/http-gateway';
import { resolveInputs, IntegrationError } from '../src/integration/resolve';
import type { ExecArtifact, DecisionRequest } from '../src/deterministic/types';
import type { Connector } from '@metis/core/domain';

/**
 * The gateway that reaches a network, tested against one.
 *
 * Most of these use an injected `fetch` because the behaviour under test is the
 * gateway's, not Node's. One does not: `resolves a decision input from a real
 * HTTP server` stands up a listener and drives the whole path, because every
 * other test here would pass equally well against an interface that never
 * worked, and that was the defect this file exists to close.
 */

const connector = (over: Partial<Connector> & { id: string }): Connector => ({
  name: over.id,
  kind: 'rest',
  description: '',
  target: 'https://bureau.example/v1/file',
  declaredP95Ms: 20,
  timeoutMs: 100,
  onFailure: 'fail',
  cacheTtlSeconds: 0,
  provides: [{ field: 'creditScore', path: 'file.score', type: 'number' }],
  active: true,
  updatedAt: '2026-09-07T00:00:00.000Z',
  updatedBy: 'test@metis.example',
  ...over,
});

const context = {
  tenantId: 'telco-uk',
  customerId: 'cust_9001',
  channel: 'web',
  occurredAt: '2026-09-07T10:00:00.000Z',
};

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve()))
    )
  );
});

/** A listener that answers every request with `handler`. Closed after each test. */
async function listen(
  handler: (body: unknown, res: http.ServerResponse) => void
): Promise<string> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      handler(raw ? JSON.parse(raw) : undefined, res);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('HttpIntegrationGateway', () => {
  it('POSTs the resolution context and returns the parsed payload', async () => {
    let seen: unknown;
    let method: string | undefined;
    const target = await listen((body, res) => {
      seen = body;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ file: { score: 712 } }));
    });
    servers[servers.length - 1].on('request', (req) => {
      method = req.method;
    });

    const gateway = new HttpIntegrationGateway();
    const payload = await gateway.fetch(connector({ id: 'conn_bureau', target }), context);

    expect(payload).toEqual({ file: { score: 712 } });
    expect(method).toBe('POST');
    // In the body, never the query string: a customer reference in a URL is in
    // every proxy log between here and the endpoint.
    expect(seen).toEqual({
      tenantId: 'telco-uk',
      customerId: 'cust_9001',
      channel: 'web',
      occurredAt: '2026-09-07T10:00:00.000Z',
    });
  });

  it('resolves a decision input from a real HTTP server', async () => {
    const target = await listen((_body, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ file: { score: 640 } }));
    });

    const artifact = {
      id: 'flow_1',
      version: '1.0.0',
      tenantId: 'telco-uk',
      candidateKeys: [],
      packageVersions: {},
      nodes: [{ id: 'n_source', type: 'source', label: 'Source', connectorIds: ['conn_bureau'] }],
      edges: [],
    } as unknown as ExecArtifact;

    const request = {
      ...context,
      placement: 'account_dashboard_hero',
      input: {},
    } as unknown as DecisionRequest;

    const resolved = await resolveInputs(
      artifact,
      [connector({ id: 'conn_bureau', target })],
      request,
      new HttpIntegrationGateway()
    );

    expect(resolved.input.creditScore).toBe(640);
    expect(resolved.bindings).toEqual([
      { field: 'creditScore', connectorId: 'conn_bureau', nodeId: 'n_source' },
    ]);
    expect(resolved.calls[0]).toMatchObject({ connectorId: 'conn_bureau', outcome: 'ok' });
  });

  it('reports a non-2xx as an error rather than parsing the body', async () => {
    const target = await listen((_body, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'down for maintenance' }));
    });

    const gateway = new HttpIntegrationGateway();
    await expect(
      gateway.fetch(connector({ id: 'conn_bureau', target }), context)
    ).rejects.toThrow(/answered HTTP 503/);
  });

  it('says so when a 200 is not JSON', async () => {
    const target = await listen((_body, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>Sign in to continue</html>');
    });

    const gateway = new HttpIntegrationGateway();
    await expect(
      gateway.fetch(connector({ id: 'conn_bureau', target }), context)
    ).rejects.toThrow(/is not JSON/);
  });

  it('aborts at the declared timeout', async () => {
    const target = await listen((_body, res) => {
      // Never answers. The gateway's AbortController has to end this.
      void res;
    });

    const gateway = new HttpIntegrationGateway();
    const failure = await gateway
      .fetch(connector({ id: 'conn_slow', target, timeoutMs: 40 }), context)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(IntegrationError);
    expect((failure as IntegrationError).outcome).toBe('timeout');
  });

  it('refuses a target that is not an http(s) URL', async () => {
    const gateway = new HttpIntegrationGateway();
    await expect(
      gateway.fetch(connector({ id: 'conn_x', target: 'featurestore://telco-uk/billing' }), context)
    ).rejects.toThrow(/not an http\(s\) URL/);
  });

  it('names W-009 rather than attempting a feature-store read', async () => {
    const gateway = new HttpIntegrationGateway();
    await expect(
      gateway.fetch(
        connector({ id: 'conn_billing', kind: 'feature-store', target: 'featurestore://x/y' }),
        context
      )
    ).rejects.toThrow(/no feature service to read \(W-009\)/);
  });

  it('serves a static connector from its declared defaults, with no I/O', async () => {
    const gateway = new HttpIntegrationGateway({
      fetchImpl: () => {
        throw new Error('a static connector must not reach the network');
      },
    });

    const payload = await gateway.fetch(
      connector({
        id: 'conn_regime',
        kind: 'static',
        target: '',
        provides: [
          { field: 'regulatoryRegime', path: 'tenant.regime', type: 'string', defaultValue: 'FCA' },
          { field: 'inMigration', path: 'tenant.flags.migrating', type: 'boolean', defaultValue: false },
        ],
      }),
      context
    );

    expect(payload).toEqual({ tenant: { regime: 'FCA', flags: { migrating: false } } });
  });

  it('sends no credential header, because there is nowhere to configure one', async () => {
    // ADR-007 is Proposed. Until it is decided this gateway authenticates
    // nothing, and the check exists so that "we added an apiKey field to get a
    // demo working" fails here rather than being discovered in an append-only
    // audit log six months later.
    let headers: http.IncomingHttpHeaders | undefined;
    const target = await listen((_body, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ file: { score: 700 } }));
    });
    servers[servers.length - 1].on('request', (req) => {
      headers = req.headers;
    });

    await new HttpIntegrationGateway().fetch(connector({ id: 'conn_bureau', target }), context);

    expect(headers?.authorization).toBeUndefined();
    expect(Object.keys(headers ?? {}).filter((h) => /key|token|secret/i.test(h))).toEqual([]);
  });
});

describe('MemoryIntegrationCache', () => {
  it('expires an entry on its TTL', () => {
    let now = 1_000_000;
    const cache = new MemoryIntegrationCache(() => now);

    cache.set('k', { score: 1 }, 60);
    expect(cache.get('k')).toEqual({ score: 1 });

    now += 59_000;
    expect(cache.get('k')).toEqual({ score: 1 });

    now += 2_000;
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('stores nothing when caching is disabled', () => {
    const cache = new MemoryIntegrationCache();
    cache.set('k', { score: 1 }, 0);
    expect(cache.get('k')).toBeUndefined();
  });

  it('serves a second resolution from cache and calls the source once', async () => {
    let calls = 0;
    const target = await listen((_body, res) => {
      calls++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ file: { score: 555 } }));
    });

    const gateway = new HttpIntegrationGateway({ cache: new MemoryIntegrationCache() });
    const artifact = {
      id: 'flow_1',
      version: '1.0.0',
      tenantId: 'telco-uk',
      candidateKeys: [],
      packageVersions: {},
      nodes: [{ id: 'n_source', type: 'source', label: 'Source', connectorIds: ['conn_bureau'] }],
      edges: [],
    } as unknown as ExecArtifact;
    const request = { ...context, placement: 'p', input: {} } as unknown as DecisionRequest;
    const connectors = [connector({ id: 'conn_bureau', target, cacheTtlSeconds: 300 })];

    const first = await resolveInputs(artifact, connectors, request, gateway);
    const second = await resolveInputs(artifact, connectors, request, gateway);

    expect(calls).toBe(1);
    expect(second.input.creditScore).toBe(first.input.creditScore);
    expect(first.calls[0].cacheHit).toBe(false);
    expect(second.calls[0].cacheHit).toBe(true);
  });
});
