import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { ACCOUNTS } from './helpers';

/**
 * The spec is the contract, or it is decoration.
 *
 * `packages/client` is generated from `docs/metis-api.openapi.yaml`, so the
 * console cannot call an operation the spec does not declare — that is a
 * compile error. This suite covers the other direction, which the compiler
 * cannot see:
 *
 *   1. Every operation the spec says is BUILT is actually served.
 *   2. What comes back validates against the schema the spec declares.
 *
 * Operations marked `x-metis-status: proposed` are exempt. They are registered
 * in docs/gaps.md as contracts the platform has not built yet, and asserting
 * them would only teach us to ignore a red suite.
 */

const SPEC_PATH = path.resolve(__dirname, '../../../../docs/metis-api.openapi.yaml');

/** Only the parts of the document this suite reads. */
interface SpecOperation {
  operationId?: string;
  'x-metis-status'?: string;
  responses?: Record<string, { content?: Record<string, { schema?: object }> }>;
}
interface Spec {
  paths: Record<string, Record<string, SpecOperation>>;
  components: Record<string, unknown>;
}

const spec = yaml.load(fs.readFileSync(SPEC_PATH, 'utf8')) as Spec;

interface Operation {
  id: string;
  method: string;
  path: string;
  proposed: boolean;
  responseSchema?: object;
  successStatus: number;
}

function loadOperations(): Operation[] {
  const out: Operation[] = [];

  for (const [pathname, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'put', 'post', 'patch', 'delete']) {
      const op = item[method];
      if (!op?.operationId) continue;

      const status = Object.keys(op.responses ?? {}).find((c) => c.startsWith('2'));
      out.push({
        id: op.operationId,
        method: method.toUpperCase(),
        path: pathname,
        proposed: op['x-metis-status'] === 'proposed',
        responseSchema: status
          ? op.responses?.[status]?.content?.['application/json']?.schema
          : undefined,
        successStatus: status ? Number(status) : 200,
      });
    }
  }
  return out;
}

const OPERATIONS = loadOperations();
const BUILT = OPERATIONS.filter((o) => !o.proposed);

/**
 * Ajv with the spec's whole component set registered, so `$ref` resolves the
 * same way it does for a real client.
 */
function makeValidator(schema: object): ValidateFunction {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema({ $id: 'metis', components: spec.components });
  // Rewrite local refs onto the registered document.
  const rewritten = JSON.parse(
    JSON.stringify(schema).replace(/"#\/components\//g, '"metis#/components/')
  );
  return ajv.compile(rewritten);
}

/**
 * Concrete values for each operation's path parameters, resolved from live data
 * so the URLs are real rather than invented.
 */
async function resolveParams(api: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const json = async (url: string) => (await api.get(url, { headers })).json();

  const taxonomy = await json('/api/taxonomy/telco-uk');
  const decisions = await json('/api/decisions/search?limit=1');
  const changeRequests = await json('/api/change-requests');
  const artifacts = await json('/api/artifacts/telco-uk');
  const connectors = await json('/api/connectors/telco-uk');

  return {
    tenantId: 'telco-uk',
    connectorId: connectors.connectors[0].id,
    propositionId: taxonomy.propositions[0].id,
    decisionId: decisions.decisions[0].id,
    requestId: changeRequests.changeRequests[0].id,
    artifactId: artifacts.artifacts[0].id,
    // The registry keys strategies by the artifact id they were published under.
    strategyName: artifacts.artifacts[0].id,
  } as Record<string, string>;
}

/**
 * The execute body needs a real artifact id, which is only known after the
 * fixtures are read. Patched once rather than hard-coded, so a change to the
 * seed does not turn into a mystery 404.
 */
function withResolvedArtifact(body: unknown, artifactId: string): unknown {
  if (body && typeof body === 'object' && 'artifactId' in body) {
    return { ...(body as Record<string, unknown>), artifactId };
  }
  return body;
}

/**
 * Non-GET operations that are safe to call here because they change nothing.
 * Replay re-executes a historical decision and compares hashes; it writes
 * nothing, and it is the platform's loudest claim, so it is worth asserting.
 */
const SAFE_TO_CALL: Record<string, unknown | undefined> = {
  login: { email: ACCOUNTS.marcus, password: 'demo' },
  replayDecision: undefined,
  // Executing a decision writes nothing. It is also the operation the JVM
  // service in engines/kotlin serves, so asserting the console's response
  // shape here is asserting the contract both implementations answer to.
  executeDecision: {
    artifactId: 'PLACEHOLDER',
    request: {
      tenantId: 'telco-uk',
      customerId: 'cust_contract_test',
      channel: 'web',
      placement: 'account_dashboard_hero',
      occurredAt: '2026-06-01T12:00:00.000Z',
      input: { tenureMonths: 24 },
    },
  },
};

/**
 * Operations that do mutate, each already covered by a suite that resets the
 * store afterwards. This list is explicit on purpose: an operation that is
 * neither callable here nor named here fails, rather than quietly skipping.
 * That is what stops a `proposed` marker being dropped without anyone noticing.
 */
const COVERED_BY_WRITE_SUITES = new Set([
  'updateConnector',
  // Registry writes: publishing, promoting and rolling back all mutate the
  // registry, and registry.spec.ts covers them with the reset discipline.
  'publishArtifact',
  'promoteVersion',
  'rollbackVersion',
  'createProposition',
  'updateProposition',
  'updateArbitrationConfig',
  'updateAutonomySetting',
  'createChangeRequest',
  'approveChangeRequest',
  'rejectChangeRequest',
]);

test.describe('OpenAPI contract', () => {
  let token: string;
  let params: Record<string, string>;

  test.beforeAll(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    const res = await api.post('/api/auth/login', {
      data: { email: ACCOUNTS.marcus, password: 'demo' },
    });
    token = (await res.json()).token;
    params = await resolveParams(api, token);
    await api.dispose();
  });

  // The store is process-wide. Nothing here should mutate it, but a reset costs
  // milliseconds and removes the question entirely.
  test.afterAll(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    await api.post('/api/_test/reset');
    await api.dispose();
  });

  test('the spec declares operations, and marks the unbuilt ones', () => {
    expect(OPERATIONS.length).toBeGreaterThan(0);
    expect(BUILT.length).toBeGreaterThan(0);
    // A spec where everything is "proposed" would pass every other test here.
    expect(BUILT.length).toBeGreaterThan(OPERATIONS.length / 2);
  });

  test('every built operation is either callable here or named as covered', () => {
    const unclassified = BUILT.filter(
      (op) =>
        op.method !== 'GET' &&
        !(op.id in SAFE_TO_CALL) &&
        !COVERED_BY_WRITE_SUITES.has(op.id)
    ).map((op) => op.id);

    expect(
      unclassified,
      'Add each to SAFE_TO_CALL if it changes nothing, or to ' +
        'COVERED_BY_WRITE_SUITES naming the suite that covers it. ' +
        'An operation marked built must be accounted for somewhere.'
    ).toEqual([]);
  });

  for (const op of BUILT) {
    const callable = op.method === 'GET' || op.id in SAFE_TO_CALL;

    test(`${op.id} is served and matches its schema`, async ({ request }) => {
      // Skip before building the URL. The other way round, a mutating
      // operation with an unresolved path parameter fails on the fixture
      // lookup rather than skipping, which reports a missing test fixture as
      // if the endpoint were broken.
      test.skip(!callable, `${op.id} mutates state; covered by a write suite`);

      const url =
        '/api' +
        op.path.replace(/\{(\w+)\}/g, (_, name: string) => {
          const value = params[name];
          expect(value, `no fixture value for path parameter "${name}"`).toBeTruthy();
          return encodeURIComponent(value);
        });

      const body = withResolvedArtifact(SAFE_TO_CALL[op.id], params.artifactId);
      const res = await request.fetch(url, {
        method: op.method,
        headers: { Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { data: body as never }),
      });

      expect(
        res.status(),
        `${op.method} ${url} — the spec says this is built`
      ).toBe(op.successStatus);

      if (!op.responseSchema) return;

      const payload = await res.json();
      const validate = makeValidator(op.responseSchema);
      const valid = validate(payload);

      expect(
        valid
          ? []
          : (validate.errors ?? []).map(
              (e) => `${e.instancePath || '/'} ${e.message}`
            ),
        `${op.id} response does not match the schema the spec declares`
      ).toEqual([]);
    });
  }
});

/**
 * The same operation, two implementations, one set of expected hashes.
 *
 * `docs/conformance/service-cases.json` holds 60 real decisions. The JVM
 * service reproduces them over HTTP in `ServiceConformanceTest`; this asserts
 * the console's endpoint does too. Passing both is what makes "the JVM service
 * is interchangeable" a checked statement rather than a hope.
 */
test.describe('executeDecision agrees across engines', () => {
  const casesPath = path.resolve(__dirname, '../../../../docs/conformance/service-cases.json');
  const serviceCases: {
    cases: {
      artifactId: string;
      request: Record<string, unknown>;
      expected: { id: string; chainHash: string; winner: string | null };
    }[];
  } = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  test('the console reproduces every hash the JVM service is held to', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: ACCOUNTS.marcus, password: 'demo' },
    });
    const token = (await res.json()).token;

    const failures: string[] = [];
    let offered = 0;

    for (const c of serviceCases.cases) {
      const response = await request.post('/api/decisions', {
        headers: { Authorization: `Bearer ${token}` },
        data: { artifactId: c.artifactId, request: c.request },
      });

      if (response.status() !== 200) {
        failures.push(`${c.expected.id}: HTTP ${response.status()}`);
        continue;
      }
      const body = await response.json();
      if (body.chainHash !== c.expected.chainHash) {
        failures.push(
          `${c.expected.id}: chain hash differs — winner expected ${c.expected.winner}, got ${body.decision.winner}`
        );
        continue;
      }
      expect(body.id).toBe(c.expected.id);
      if (c.expected.winner !== null) offered++;
    }

    expect(failures, `${failures.length} of ${serviceCases.cases.length} decisions diverge`).toEqual([]);

    // A sample that never offers anything would pass on hashes while
    // exercising neither scoring nor arbitration.
    expect(offered).toBeGreaterThan(0);
    expect(offered).toBeLessThan(serviceCases.cases.length);
  });
});
