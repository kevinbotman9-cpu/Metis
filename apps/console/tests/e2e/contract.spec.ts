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
  const changeSets = await json('/api/change-sets');
  const artifacts = await json('/api/artifacts/telco-uk');
  const connectors = await json('/api/connectors/telco-uk');
  const placements = await json('/api/placements/telco-uk');

  return {
    tenantId: 'telco-uk',
    connectorId: connectors.connectors[0].id,
    // A decidable one: `decidePlacement` refuses a slot that is not, and a
    // fixture-ordering change should not turn that into a mystery 404 here.
    // `decidable` rather than `active` since ADR-013 — whether a decision may
    // be made is the question this endpoint answers, and whether anything
    // delivers the result is a different one.
    placementKey: placements.placements.find((p: { decidable: boolean }) => p.decidable).key,
    offerId: taxonomy.offers[0].id,
    decisionId: decisions.decisions[0].id,
    changeSetId: changeSets.changeSets[0].id,
    artifactId: artifacts.artifacts[0].id,
    // The registry keys flows by the artifact id they were published under.
    flowName: artifacts.artifacts[0].id,
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
  // Composes a slate from one decision. Writes to the ledger exactly as
  // executeDecision does — which is to say, appends rather than mutates — so it
  // is as safe to call here as that is, and asserting its shape is asserting
  // the contract a website integrates against.
  decidePlacement: {
    request: {
      tenantId: 'telco-uk',
      customerId: 'cust_contract_slate',
      channel: 'web',
      occurredAt: '2026-06-01T12:00:00.000Z',
      input: { tenureMonths: 24 },
    },
  },
};

/**
 * Operations that mutate, each naming the suite that covers it.
 *
 * A set of bare ids was an unchecked promise, and it hid a real defect:
 * `createOffer` was named here, no suite called it, and the operation was not
 * served at all — a built operation returning 404 with every check agreeing
 * that was fine. Naming the file is not enough either, because most of these
 * are driven through the UI and never mention the operation by name.
 *
 * So the claim is explicit on both sides. An entry here names a spec file, and
 * that file must carry `covers: <operationId>` in a comment on the test that
 * exercises it. Two greppable halves that have to agree, which is the cheapest
 * honest version of "another suite covers this".
 */
const COVERED_BY_WRITE_SUITES: Record<string, string> = {
  updateConnector: 'integrations.spec.ts',
  // Appends to the decision ledger, so it cannot be called speculatively here
  // against an arbitrary decision id.
  recordOutcome: 'ledger.spec.ts',
  // Changes what runs in production beside the active version.
  setShadow: 'shadow.spec.ts',
  // Registry writes, covered with the reset discipline.
  publishArtifact: 'registry.spec.ts',
  promoteVersion: 'registry.spec.ts',
  rollbackVersion: 'registry.spec.ts',
  // The taxonomy's writes are driven entirely through the screen, because the
  // point of the slice was that they could not be. A speculative call here
  // would exercise the endpoint and prove nothing about the journey.
  // Configuring a slot is the whole point of the screen, so it is driven
  // through it. A speculative call would prove the endpoint and nothing about
  // whether anybody can reach it.
  createPlacement: 'placement-authoring.spec.ts',
  updatePlacement: 'placement-authoring.spec.ts',
  createObjective: 'taxonomy-authoring.spec.ts',
  updateObjective: 'taxonomy-authoring.spec.ts',
  createCategory: 'taxonomy-authoring.spec.ts',
  updateCategory: 'taxonomy-authoring.spec.ts',
  createOffer: 'permissions-and-writes.spec.ts',
  createCreative: 'permissions-and-writes.spec.ts',
  updateCreative: 'permissions-and-writes.spec.ts',
  updateOffer: 'permissions-and-writes.spec.ts',
  updateArbitrationConfig: 'permissions-and-writes.spec.ts',
  updateAutonomySetting: 'permissions-and-writes.spec.ts',
  createChangeSet: 'permissions-and-writes.spec.ts',
  approveChangeSet: 'permissions-and-writes.spec.ts',
  rejectChangeSet: 'permissions-and-writes.spec.ts',
  // Conditions are validated against the data model, so a speculative call
  // here would either need a valid field path — duplicating the schema in this
  // file — or would exercise only the refusal.
  createTargetingPolicy: 'policy-authoring.spec.ts',
  updateTargetingPolicy: 'policy-authoring.spec.ts',
  // Intake is a four-stage pipeline whose value is entirely in the ordering,
  // so a speculative call to any one stage would exercise the refusal rather
  // than the operation.
  createDataSource: 'intake.spec.ts',
  updateDataSource: 'intake.spec.ts',
  landRows: 'intake.spec.ts',
  validateDataSource: 'intake.spec.ts',
  activateDataSource: 'intake.spec.ts',
  // Editing a graph and then proving the edit reached a decision needs the
  // whole publish-and-promote chain, which a speculative call cannot stand in
  // for.
  updateDecisionFlowDraft: 'flow-authoring.spec.ts',
  // Creating one and then starting it is the whole point; a speculative call
  // would only exercise the draft state.
  createExperiment: 'experiments.spec.ts',
  updateExperiment: 'experiments.spec.ts',
};

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

  test('the write suites cover what this list claims they cover', () => {
    // An exemption nothing checks is a place for a defect to hide, which is
    // what it was. Each entry claims a file; the file has to say so back.
    const missing: string[] = [];

    for (const [id, file] of Object.entries(COVERED_BY_WRITE_SUITES)) {
      const full = path.join(__dirname, file);
      if (!fs.existsSync(full)) {
        missing.push(`${id}: ${file} does not exist`);
        continue;
      }
      if (!fs.readFileSync(full, 'utf8').includes(`covers: ${id}`)) {
        missing.push(`${id}: ${file} carries no \`covers: ${id}\` marker`);
      }
    }

    expect(
      missing,
      'These are exempted from the contract assertion as covered elsewhere. ' +
        'Put a `covers: <operationId>` comment on the test that exercises each, ' +
        'or stop claiming it is covered.'
    ).toEqual([]);
  });

  test('every built operation is either callable here or named as covered', () => {
    const unclassified = BUILT.filter(
      (op) =>
        op.method !== 'GET' &&
        !(op.id in SAFE_TO_CALL) &&
        !(op.id in COVERED_BY_WRITE_SUITES)
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
test.describe('the contract holds for a decision nobody seeded', () => {
  /**
   * The branch this suite never exercised.
   *
   * `GET /decisions/{id}/trace` resolves a seeded decision through `findTrace`,
   * which projects the engine's record into the flat shape the spec declares,
   * and a live one out of the ledger. Until 2026-09-09 the ledger branch
   * returned `entry.record` — the **runtime** `DecisionRecord`, shaped
   * `{ id, decision: {...} }` — so every decision the storefront made answered
   * 200 with a body the console threw on, reading `trace.scores` of undefined.
   *
   * This suite did not catch it, and was right not to: it resolved its
   * decision id from the seeded corpus, took the correct branch, and passed.
   * The defect lived in the half of the endpoint no contract test had ever
   * reached, from the day live decisions became possible.
   *
   * So this makes a decision first and then asserts the contract against it.
   */
  let token: string;

  test.beforeAll(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL });
    const res = await api.post('/api/auth/login', {
      data: { email: ACCOUNTS.marcus, password: 'demo' },
    });
    token = (await res.json()).token;
    await api.dispose();
  });

  test('a live decision trace matches the schema the spec declares', async ({
    playwright,
    baseURL,
  }) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });

    const made = await api.post('/api/decisions', {
      data: { artifactId: 'next-best-action', request: liveRequest() },
    });
    expect(made.status(), await made.text()).toBeLessThan(300);
    const decisionId = (await made.json()).decision?.id ?? (await made.json()).id;
    expect(decisionId, 'no decision id came back').toBeTruthy();

    const res = await api.get(`/api/decisions/${decisionId}/trace`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // The exact shape the console reads. `scores` and `eliminations` at the top
    // level are what the page throws on when they are one level down.
    for (const field of REQUIRED_TRACE_FIELDS) {
      expect(body, `trace is missing \`${field}\` — the runtime shape leaking again`).toHaveProperty(
        field
      );
    }
    // And the shape it must *not* be.
    expect(body).not.toHaveProperty('decision');
    expect(body.id).toBe(decisionId);

    // A decision nobody seeded is recorded, not synthetic, and says so.
    expect(body.provenance?.source).toBe('recorded');

    await api.dispose();
  });

  test('a seeded trace and a live one have the same shape', async ({ playwright, baseURL }) => {
    // The two branches converge on one projection. Before they did, the only
    // way to notice was to open a live decision in the console and watch it
    // fail.
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });

    const search = await api.get('/api/decisions/search?limit=1');
    const seededId = (await search.json()).decisions[0].id;
    const seeded = await (await api.get(`/api/decisions/${seededId}/trace`)).json();

    const made = await api.post('/api/decisions', {
      data: { artifactId: 'next-best-action', request: liveRequest() },
    });
    const liveId = (await made.json()).decision?.id ?? (await made.json()).id;
    const live = await (await api.get(`/api/decisions/${liveId}/trace`)).json();

    // Presence, not type. `winner` is `string | null` by declaration, so a
    // suppressed seeded decision and an offering live one legitimately differ
    // in type while having the same shape — which is the thing being asserted.
    for (const field of REQUIRED_TRACE_FIELDS) {
      expect(field in seeded, `seeded trace has no \`${field}\``).toBe(true);
      expect(field in live, `live trace has no \`${field}\` — the runtime shape leaking`).toBe(
        true
      );
    }
    expect(seeded.provenance.source).toBe('synthetic');
    expect(live.provenance.source).toBe('recorded');

    await api.dispose();
  });
});

/** What the console reads off a trace, and what the spec requires. */
const REQUIRED_TRACE_FIELDS = [
  'id',
  'artifactId',
  'artifactVersion',
  'tenantId',
  'customerId',
  'timestamp',
  'channel',
  'placement',
  'winner',
  'candidateCount',
  'eliminations',
  'scores',
  'arbitration',
  'timings',
  'consentState',
  'chainHash',
  'inputSnapshotHash',
];

function liveRequest() {
  return {
    tenantId: 'telco-uk',
    customerId: 'cust_contract_probe',
    channel: 'web',
    // Required on `DecisionRequest`. Omitting it produced a trace with no
    // `placement`, which the spec marks required — the API accepted the
    // malformed request rather than refusing it, which is its own small gap.
    placement: 'homepage_hero',
    occurredAt: '2026-09-05T12:00:00.000Z',
    input: {
      customer: {
        age: 40,
        credit_status: 'pass',
        account_status: 'active',
        current_plan: 'sim_only',
        bill_to_income_ratio: 0.02,
        arrears_count_12mo: 0,
      },
      address: { fibre_available: true },
      usage: { pct_of_allowance_3mo_avg: 0.5, months_of_history: 12 },
      contract: { days_to_end: 200 },
      events: { pac_requested_within_days: 999 },
      device: { residual_value: 0 },
      offer: { monthly_delta: 300 },
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
    contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
  };
}

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
