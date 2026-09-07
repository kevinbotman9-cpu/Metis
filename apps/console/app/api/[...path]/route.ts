/**
 * Development API — serves the mutable store over real HTTP.
 *
 * Why this exists alongside mocks/handlers.ts: MSW needs a service worker,
 * which will not register in every embedded browser context, and never runs
 * server-side. These route handlers read and write the SAME store, so there is
 * still exactly one place data lives, and components still reach it only
 * through the generated client. MSW remains the mocking layer for Storybook.
 *
 * Writes persist for the life of the server process. Every mutation records an
 * audit event, so the log cannot drift from the data.
 *
 * Every route below maps to an operationId in docs/metis-api.openapi.yaml.
 */

import { NextResponse } from 'next/server';
import { store, resetStore, recordAudit } from '@/mocks/store';
import { findTrace, decisions } from '@/mocks/fixtures/decisions';
import {
  IdempotencyConflict,
  compareShadow,
  buildShadowReport,
  resolveInputs,
  selectSlate,
  IntegrationError,
  HttpIntegrationGateway,
  MemoryIntegrationCache,
} from '@metis/runtime';
import type { IntegrationGateway } from '@metis/runtime';
import { RecordedIntegrationGateway } from '@/mocks/gateway';
import { recorded, listCalls, clearCalls, isEnabled as callLogEnabled } from '@/mocks/call-log';
import type { DecisionRecord } from '@metis/runtime';
import type { OutcomeType } from '@metis/ledger';
import type { Creative, Offer } from '@metis/core/domain';
import { validateCreativeContent, offerMayBeActive } from '@metis/core/creative';
import {
  conditionProblems,
  listFieldPaths,
  schemaProblems,
  operatorsFor,
  typeOf,
} from '@metis/core/profile-schema';
import type { TargetingPolicy } from '@metis/core/domain';
import { findGenerated, catalogueSnapshot } from '@/mocks/fixtures/engine';
import {
  currentCatalogue,
  catalogueByHash,
  registerCatalogue,
} from '@/mocks/catalogue-state';
import { compilations, findCompilation, compileContext } from '@/mocks/fixtures/compiled';
import type { DecisionFlowSource } from '@metis/compiler/decision-flow';
import {
  replay as replayDecision,
  execute as executeDecision,
} from '@metis/runtime/deterministic/engine';
import { execArtifacts } from '@/mocks/fixtures/engine';
import type { ExecArtifact } from '@metis/runtime/deterministic/types';
import type { DecisionRequest } from '@metis/runtime/deterministic/types';

/** The request half of an executeDecision body, as the spec declares it. */
type DecisionRequestBody = Partial<DecisionRequest> &
  Pick<DecisionRequest, 'tenantId' | 'customerId' | 'channel' | 'placement'>;

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * The gateway integration resolution runs through.
 *
 * Recorded by default, HTTP when `METIS_INTEGRATIONS=live` is set. The default
 * is not squeamishness about the network: the fixture connectors target
 * `bureau.example` and `consent.telco.example`, which do not resolve, and two
 * of them are configured `onFailure: 'fail'` — so a dev console pointed at them
 * would answer 503 to every decision. Live mode is what a deployment with real
 * endpoints sets, and `HttpIntegrationGateway` is the same code either way.
 *
 * Module scope so the cache outlives a request, which is the only way a
 * `cacheTtlSeconds` of 300 means anything.
 */
/**
 * The fixture catalogue, registered so history stays replayable.
 *
 * The 5,000 generated decisions were made against it at import time and their
 * records name its hash. Replay now looks a catalogue up rather than assuming
 * one, so without this every seeded decision would answer 409 — the console's
 * entire decision history, unreplayable, on the surface whose whole claim is
 * that it never is.
 */
registerCatalogue(catalogueSnapshot);

const integrationGateway: IntegrationGateway =
  process.env.METIS_INTEGRATIONS === 'live'
    ? new HttpIntegrationGateway({ cache: new MemoryIntegrationCache() })
    : new RecordedIntegrationGateway();

/**
 * Run the shadow version of a flow and record how it compared.
 *
 * Never on the request path. Errors are swallowed into the comparison store
 * rather than thrown: a shadow that fails must not affect the decision that was
 * already returned, and must not become an unhandled rejection either.
 */
async function runShadow(active: DecisionRecord, request: DecisionRequest): Promise<void> {
  const done = (async () => {
    try {
      const env = await store.registry.environment(
        request.tenantId,
        active.decision.artifactId,
        'production'
      );
      if (!env?.shadowVersion) return;

      // The registry's own compiled artifact for that version, not a lookup by
      // flow id: a shadow is a *version* of the same flow, and matching the
      // version string against artifact ids — which is what this did first —
      // silently found nothing and reported a shadow that never ran.
      const published = await store.registry.version(
        request.tenantId,
        active.decision.artifactId,
        env.shadowVersion
      );
      // A shadow version with no stored artifact is a configuration problem,
      // not a decision problem. Recording nothing is right: an agreement rate
      // computed from runs that never happened would be worse than a gap.
      if (!published) return;
      const shadowArtifact: ExecArtifact = published.artifact;

      const started = performance.now();
      // The catalogue the active decision used, looked up by the hash it
      // recorded — not the current one. A shadow compared against a catalogue
      // edited since would report a divergence that is about the edit rather
      // than about the two versions, which is the one thing it must not do.
      const catalogue =
        catalogueByHash(active.decision.catalogueSnapshotHash) ?? currentCatalogue();
      const shadow = executeDecision(shadowArtifact, catalogue, request);
      const shadowMs = performance.now() - started;

      store.shadowComparisons.push(
        compareShadow(
          active,
          shadow,
          { activeVersion: env.activeVersion ?? 'unknown', shadowVersion: env.shadowVersion },
          shadowMs
        )
      );
    } catch {
      // Deliberately silent. The decision already went out.
    }
  })();

  store.shadowInFlight.add(done);
  await done.finally(() => store.shadowInFlight.delete(done));
}

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers });
const notFound = (message = 'Not found') => json({ error: 'not_found', message }, 404);
const forbidden = (permission: string) =>
  json(
    { error: 'forbidden', message: `This action requires the ${permission} permission.` },
    403
  );

function actor(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token.startsWith('metis.')) return null;
  return store.users.find((u) => u.id === token.slice('metis.'.length)) ?? null;
}

function publicUser(u: (typeof store.users)[number]) {
  const { password: _password, ...rest } = u;
  return rest;
}

/**
 * Refuse a creative whose content does not satisfy the channel it declares.
 *
 * Returns a response, or null when there is nothing wrong. Shared by create and
 * update so the two cannot enforce different rules — an offer that could be
 * edited into a state it could not be created in is the kind of asymmetry
 * nobody finds until it matters.
 */

/**
 * Refuse a policy whose conditions the data model cannot satisfy.
 *
 * Returns a response, or null when there is nothing wrong. Shared by create and
 * update, so a policy cannot be edited into a state it could not be created in.
 *
 * This is the server half of the field picker. The editor offers only what the
 * model has, but the API is reachable without it, and the failure being
 * prevented is severe enough to check on both sides: a condition naming a field
 * that does not exist fails every comparison, so the rule suppresses every
 * candidate while the trace reports a confident ELIGIBILITY_FAILED against a
 * real policy id.
 */
function policyProblems(conditions: TargetingPolicy['conditions']) {
  const problems: { field: string; message: string; code: string }[] = [];

  if (!Array.isArray(conditions) || conditions.length === 0) {
    return json(
      {
        error: 'invalid_policy',
        message: 'A policy with no conditions matches everything, which is never what was meant.',
        problems: [{ field: 'conditions', message: 'Add at least one condition.', code: 'EMPTY' }],
      },
      400
    );
  }

  conditions.forEach((condition, i) => {
    for (const p of conditionProblems(store.profileSchema, condition)) {
      // Indexed so the dialog can put each message against the row that
      // produced it rather than at the top of the form.
      problems.push({ field: `conditions.${i}`, message: p.message, code: p.code });
    }
  });

  if (problems.length === 0) return null;
  return json(
    {
      error: 'invalid_policy',
      message: `${problems.length} condition(s) do not match the data model.`,
      problems,
    },
    400
  );
}

const blankString = (v: unknown) => typeof v !== 'string' || v.trim() === '';

function creativeProblems(channel: Creative['channel'], content: Creative['content']) {
  const problems = validateCreativeContent(channel, content);

  // The slot key is checked here rather than in `@metis/core`, because which
  // slots exist is tenant configuration and that package cannot see it. A
  // creative naming a slot nobody configured would simply never be chosen —
  // silently, which is the worst way for content to fail.
  if (channel === 'web') {
    const named = (content as { placement?: string }).placement;
    if (named && !store.placements.some((p) => p.key === named)) {
      problems.push({
        field: 'content.placement',
        message: `No placement '${named}'. Configured: ${store.placements
          .map((p) => p.key)
          .sort()
          .join(', ')}.`,
      });
    }
  }

  if (problems.length === 0) return null;
  return json(
    {
      error: 'invalid_creative',
      message: `${problems.length} problem(s) with this ${channel} creative.`,
      problems,
    },
    400
  );
}

/** Resolve the effective autonomy for an offer, most specific scope first. */
function resolveAutonomyFor(offerId: string, categoryId: string, objectiveId: string) {
  const a = store.autonomy;
  return (
    a.find((s) => s.scope.level === 'offer' && s.scope.targetId === offerId) ||
    a.find((s) => s.scope.level === 'category' && s.scope.targetId === categoryId) ||
    a.find((s) => s.scope.level === 'objective' && s.scope.targetId === objectiveId) ||
    a.find((s) => s.scope.level === 'tenant') ||
    null
  );
}

/**
 * The decision pipeline both decision endpoints run.
 *
 * `POST /decisions` answers with one winner and
 * `POST /placements/{key}/decisions` answers with a slate, and they must
 * otherwise behave identically: same idempotency, same integration resolution,
 * same ledger write, same shadow. Two copies of this would drift, and the
 * drift would be invisible — both would keep returning plausible decisions.
 *
 * Returns rather than responds, so the caller shapes the payload. The error
 * cases carry a built `Response` because each already has a considered status
 * and body that neither caller should have to reconstruct.
 */
type DecideOutcome =
  | { kind: 'error'; response: Response }
  | { kind: 'replay'; record: DecisionRecord }
  | { kind: 'decided'; trace: DecisionRecord };

async function decideAndRecord(
  artifact: ExecArtifact,
  decisionRequest: DecisionRequest
): Promise<DecideOutcome> {
  // Idempotency and durability, through the ledger.
  //
  // Resolved before execution: executing and then discovering the key was
  // taken would be wasted work on a retry and, on a conflict, would have
  // already made a decision the caller must not be given.
  const resolved = await store.ledger.resolve(decisionRequest);

  if (resolved.kind === 'conflict') {
    const e = new IdempotencyConflict(
      decisionRequest.idempotencyKey as string,
      resolved.storedHash,
      resolved.attemptedHash
    );
    return {
      kind: 'error',
      response: json({ error: 'idempotency_conflict', message: e.message }, 409),
    };
  }

  if (resolved.kind === 'replay') {
    // The original decision, not a re-execution that happens to agree.
    // A catalogue edit between the two calls is all it takes for it not
    // to agree, and the caller asked one question.
    return { kind: 'replay', record: resolved.entry.record };
  }

  // Integrations resolve here, before the deterministic core and after
  // the idempotency check — a retry that is going to be answered from the
  // ledger must not pay for a bureau call first.
  //
  // One catalogue for the whole decision: the connectors resolution dials, the
  // policies the engine applies, and the hash the record carries all come from
  // the same object. The comment this replaces protected that invariant by
  // reading the fixture in both places, which kept them consistent and kept
  // the console's writes out of both.
  const catalogue = currentCatalogue();

  let resolvedInputs;
  try {
    resolvedInputs = await resolveInputs(
      artifact,
      catalogue.connectors ?? [],
      decisionRequest,
      integrationGateway
    );
  } catch (e) {
    if (e instanceof IntegrationError) {
      // A connector configured `onFailure: 'fail'` failed, so there is no
      // decision to give. 503 rather than 500: the flow is fine and the
      // request is fine, a dependency is not, and a caller can retry.
      return {
        kind: 'error',
        response: json(
          {
            error: 'integration_failed',
            message: e.message,
            connectorId: e.connectorId,
            outcome: e.outcome,
          },
          503
        ),
      };
    }
    throw e;
  }

  // Fields the caller supplied win, which `resolveInputs` guarantees; the
  // 60 service cases carry theirs, which is why they still hash the same.
  const resolvedRequest = { ...decisionRequest, input: resolvedInputs.input };

  const trace = executeDecision(artifact, catalogue, resolvedRequest);

  // Measured, never hashed, and absent from a replay: what the wire cost
  // is not part of what was decided.
  if (resolvedInputs.calls.length > 0) trace.measured.sourceCalls = resolvedInputs.calls;

  // Recorded synchronously, before answering. §6 asks for the envelope to
  // be durable before the caller is told what was decided — a decision
  // the platform made and cannot produce afterwards is worse than one it
  // failed to make.
  await store.ledger.record(store.ledger.entryFor(trace, decisionRequest.tenantId));

  const key = decisionRequest.idempotencyKey;
  if (key) {
    const claimed = await store.ledger.claim({
      tenantId: decisionRequest.tenantId,
      key,
      requestHash: resolved.hash,
      decisionId: trace.id,
      storedAt: new Date().toISOString(),
    });
    // The store decides which claim wins under a race; use what comes
    // back rather than assuming ours landed.
    if (claimed.decisionId !== trace.id) {
      const winner = await store.ledger.get(decisionRequest.tenantId, claimed.decisionId);
      if (winner) return { kind: 'replay', record: winner.record };
    }
  }

  // The shadow runs after the response is built, and is deliberately not
  // awaited.
  //
  // §13 requires the shadow to stay out of the active latency budget, and
  // the only honest way to do that is not to make the caller wait for it.
  // Measuring it and subtracting would leave the wall clock unchanged and
  // the number a fiction. Node keeps running the promise after the
  // response is returned; what it costs is recorded on the comparison so
  // it can be read rather than assumed.
  //
  // Tracked in `store.shadowInFlight` so tests can wait for quiescence
  // instead of sleeping — an async mechanism tested with a sleep is a
  // flake with a timer attached.
  // The resolved request, not the caller's: a shadow run against different
  // inputs would report a divergence that is about resolution rather than
  // about the two versions, which is the one thing it must not do.
  void runShadow(trace, resolvedRequest);

  return { kind: 'decided', trace };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

async function handleGet(req: Request, { params }: Ctx) {
  const { path } = await params;
  const q = new URL(req.url).searchParams;
  const [head, ...rest] = path;

  switch (head) {
    case 'auth': {
      if (rest[0] !== 'session') return notFound();
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      return json({ user: publicUser(user) });
    }

    case 'taxonomy':
      return json({
        objectives: store.objectives,
        categories: store.categories,
        offers: store.offers,
      });

    case 'offers': {
      const offerId = rest[1];
      if (offerId) {
        const offer = store.offers.find((p) => p.id === offerId);
        if (!offer) return notFound(`No offer ${offerId}`);
        return json({
          offer,
          creatives: store.creatives.filter((t) => t.offerId === offer.id),
          policies: store.targetingPolicies.filter((p) =>
            offer.policyIds.includes(p.id)
          ),
          autonomy: resolveAutonomyFor(
            offer.id,
            offer.categoryId,
            offer.objectiveId
          ),
        });
      }

      let result = store.offers;
      const objectiveId = q.get('objectiveId');
      const categoryId = q.get('categoryId');
      const status = q.get('status');
      const search = (q.get('q') || '').toLowerCase().trim();

      if (objectiveId) result = result.filter((p) => p.objectiveId === objectiveId);
      if (categoryId) result = result.filter((p) => p.categoryId === categoryId);
      if (status) result = result.filter((p) => p.status === status);
      if (search) {
        result = result.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            p.key.toLowerCase().includes(search) ||
            p.description.toLowerCase().includes(search) ||
            p.tags.some((t) => t.toLowerCase().includes(search))
        );
      }
      return json({ offers: result, total: result.length });
    }

    case 'creatives': {
      // With an offer id: that offer's creatives. Without: the whole library,
      // which is the only way to ask what content exists rather than what one
      // offer has.
      const offerId = rest[1];
      if (offerId) {
        return json({ creatives: store.creatives.filter((t) => t.offerId === offerId) });
      }

      let result = store.creatives;
      const channel = q.get('channel');
      const active = q.get('active');
      const search = (q.get('q') || '').toLowerCase().trim();

      if (channel) result = result.filter((c) => c.channel === channel);
      if (active === 'true' || active === 'false') {
        result = result.filter((c) => c.active === (active === 'true'));
      }
      if (search) {
        // The content too, not only the name: somebody looking for a line of
        // copy they need to change is searching for the line, not for whatever
        // the creative was called.
        const offerKey = new Map(store.offers.map((o) => [o.id, o.key]));
        result = result.filter(
          (c) =>
            c.name.toLowerCase().includes(search) ||
            (offerKey.get(c.offerId) ?? '').toLowerCase().includes(search) ||
            JSON.stringify(c.content).toLowerCase().includes(search)
        );
      }
      return json({ creatives: result, total: result.length });
    }

    case 'targeting-policies': {
      const kind = q.get('kind');
      return json({
        policies: kind
          ? store.targetingPolicies.filter((p) => p.kind === kind)
          : store.targetingPolicies,
      });
    }

    case 'frequency-policies':
      return json({ policies: store.frequencyPolicies });

    case 'arbitration':
      return json({ config: store.arbitration, boosts: store.boosts });

    case 'autonomy':
      return json({ settings: store.autonomy });

    case 'agent-activity': {
      const outcome = q.get('outcome');
      const limit = Number(q.get('limit') || 50);
      const list = outcome
        ? store.activity.filter((a) => a.outcome === outcome)
        : store.activity;
      return json({ activity: list.slice(0, limit) });
    }

    case 'decisions': {
      if (rest[0] === 'search') {
        const action = q.get('action');
        const channel = q.get('channel');
        const customerId = q.get('customerId');
        const outcome = q.get('outcome');
        const dateFrom = q.get('dateFrom');
        const dateTo = q.get('dateTo');
        const limit = Number(q.get('limit') || 50);

        let result = decisions;
        if (action) result = result.filter((d) => d.winner === action);
        if (channel) result = result.filter((d) => d.channel === channel);
        if (customerId)
          result = result.filter((d) =>
            d.customerId.toLowerCase().includes(customerId.toLowerCase())
          );
        if (outcome === 'suppressed') result = result.filter((d) => d.winner === null);
        if (outcome === 'offered') result = result.filter((d) => d.winner !== null);
        if (dateFrom) result = result.filter((d) => d.timestamp >= dateFrom);
        if (dateTo) result = result.filter((d) => d.timestamp <= dateTo);

        const sorted = [...result].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return json({ decisions: sorted.slice(0, limit), total: sorted.length });
      }

      if (rest[1] === 'trace') {
        const trace = findTrace(rest[0]);
        if (trace) return json(trace);
        // Seeded decisions are the console's flattened display shape; anything
        // executed since is in the ledger as real engine output. Before the
        // ledger existed, POST /decisions returned an id this endpoint then
        // said did not exist.
        // The development store is single-tenant, and the trace route
        // carries no tenant segment. A multi-tenant deployment resolves this
        // from the caller's session rather than a constant.
        const entry = await store.ledger.get('telco-uk', rest[0]);
        if (entry) return json(entry.record);
        return notFound(`No decision with id ${rest[0]}`);
      }
      return notFound();
    }

    case 'outcomes': {
      // GET /api/outcomes/{tenantId}/{decisionId}
      const [tenantId, decisionId] = rest;
      if (!tenantId || !decisionId) return notFound();
      // Existence is the same question the trace route asks: seeded decisions
      // are real to this console even though they predate the ledger. A
      // decision with no outcomes yet is an empty list, not a 404 — "nothing
      // happened" and "no such decision" are different answers.
      const known =
        Boolean(findTrace(decisionId)) || Boolean(await store.ledger.get(tenantId, decisionId));
      if (!known) return notFound(`No decision with id ${decisionId}`);
      return json({ outcomes: await store.ledger.outcomesFor(tenantId, decisionId) });
    }

    case 'change-sets': {
      if (rest[0]) {
        const cr = store.changeSets.find((c) => c.id === rest[0]);
        return cr ? json(cr) : notFound(`No change set ${rest[0]}`);
      }
      const status = q.get('status');
      const result = status
        ? store.changeSets.filter((c) => c.status === status)
        : store.changeSets;
      return json({ changeSets: result, total: result.length });
    }

    case 'audit': {
      const limit = Number(q.get('limit') || 100);
      return json({ events: store.auditEvents.slice(0, limit), total: store.auditEvents.length });
    }

    case 'connectors': {
      return json({ connectors: store.connectors });
    }

    case 'placements': {
      return json({ placements: store.placements });
    }

    // GET /api/profile-schema/{tenantId} — the data model, and the paths a
    // policy may reference.
    //
    // The paths are served rather than derived in the client. The compiler and
    // the editor must agree about which operators a type admits, and the only
    // way to guarantee that is one implementation — an operator the editor
    // does not offer has to be one the compiler rejects.
    case 'profile-schema': {
      if (!rest[0]) return notFound();
      const schema = store.profileSchema;
      return json({
        schema,
        paths: listFieldPaths(schema).map((r) => ({
          path: r.path,
          kind: r.kind,
          type: typeOf(r),
          operators: operatorsFor(typeOf(r)),
          description:
            r.kind === 'field' ? r.field.description : r.aggregation.description,
          entity: r.kind === 'field' ? r.entity.name : undefined,
          members: r.kind === 'field' ? r.field.members : undefined,
          unit: r.kind === 'field' ? r.field.unit : undefined,
          sensitivity: r.kind === 'field' ? r.field.sensitivity : undefined,
        })),
        problems: schemaProblems(schema),
      });
    }

    // GET /api/inbound-calls — the traffic this API has served.
    //
    // Deliberately unauthenticated, like the placement endpoint it exists to
    // explain: a storefront integrating against a dev console has no session,
    // and requiring one would mean the surface could not see the calls it was
    // built for. That is defensible only because this route file is the
    // development API over a fixture store and serves no real customer data.
    case 'inbound-calls': {
      const limit = Math.min(Number(q.get('limit') || 100), 250);
      return json({
        enabled: callLogEnabled(),
        calls: callLogEnabled() ? listCalls(limit) : [],
      });
    }

    case 'registry': {
      // Seeding runs the fixtures through the real publish path, which is
      // asynchronous. Waiting here means a request during startup sees a
      // seeded registry rather than an empty one.
      await store.registryReady;

      const tenantId = rest[0];
      if (!tenantId) return notFound();

      // GET /registry/{tenant}/events
      if (rest[1] === 'events') {
        return json({
          events: await store.registry.events({
            tenantId,
            flowName: q.get('flowName') ?? undefined,
            limit: Number(q.get('limit') || 100),
          }),
        });
      }

      // GET /registry/{tenant}/{flow}/shadow-report
      if (rest[1] && rest[2] === 'shadow-report') {
        // A flow the registry has never heard of gets a 404, not a zeroed
        // report. A report of "0 compared, nothing shadowing" about a flow that
        // failed to compile reads as a shadow that is merely idle, and the
        // console would offer to start one against nothing.
        if ((await store.registry.versions(tenantId, rest[1])).length === 0) {
          return notFound(`No flow ${rest[1]} in the registry`);
        }
        const env = await store.registry.environment(tenantId, rest[1], 'production');
        // Filtered to the pair currently configured. Comparisons from an
        // earlier shadow describe a different question, and folding them into
        // one agreement rate would average across two migrations.
        const mine = store.shadowComparisons.filter(
          (c) => c.shadowVersion === env?.shadowVersion && c.activeVersion === env?.activeVersion
        );
        return json(
          buildShadowReport(
            rest[1],
            { activeVersion: env?.activeVersion ?? null, shadowVersion: env?.shadowVersion ?? null },
            mine
          )
        );
      }

      // GET /registry/{tenant}/{flow}
      if (rest[1]) {
        const versions = await store.registry.versions(tenantId, rest[1]);
        if (versions.length === 0) return notFound(`No flow ${rest[1]} in the registry`);
        return json({
          flowName: rest[1],
          versions,
          environments: await store.registry.environments(tenantId, rest[1]),
        });
      }

      // GET /registry/{tenant}
      return json({ flows: await store.registry.flows(tenantId) });
    }

    case 'artifacts': {
      if (rest[1]) {
        const artifact = store.artifacts.find((a) => a.id === rest[1]);
        if (!artifact) return notFound(`No flow ${rest[1]}`);
        // The compiler's verdict travels with the flow: a console that
        // hides it is no better than not compiling at all.
        return json({ ...artifact, compilation: findCompilation(artifact.id)?.result ?? null });
      }
      return json({
        artifacts: store.artifacts.map((a) => {
          const result = compilations.find((c) => c.artifactId === a.id)?.result;
          return {
            ...a,
            compileOk: result?.ok ?? null,
            errorCount: result?.diagnostics.filter((x) => x.severity === 'error').length ?? 0,
            warningCount: result?.diagnostics.filter((x) => x.severity === 'warning').length ?? 0,
          };
        }),
      });
    }

    default:
      return notFound(`No route for /${path.join('/')}`);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

async function handlePost(req: Request, { params }: Ctx) {
  const { path } = await params;
  const [head, ...rest] = path;

  switch (head) {
    case 'auth': {
      if (rest[0] !== 'login') return notFound();
      const body = (await req.json().catch(() => ({}))) as {
        email?: string;
        password?: string;
      };
      const user = store.users.find(
        (u) => u.email.toLowerCase() === (body.email || '').toLowerCase().trim()
      );
      if (!user || user.password !== body.password) {
        return json(
          {
            error: 'invalid_credentials',
            message: 'That email and password combination was not recognised.',
          },
          401
        );
      }
      return json({ token: `metis.${user.id}`, user: publicUser(user) });
    }

    case 'outcomes': {
      // POST /api/outcomes/{tenantId}/{decisionId}
      //
      // The decision must exist. An outcome for one nobody made is a
      // mis-routed event or a mis-typed id, and storing it would leave a row
      // that can never be joined to anything — found years later by whoever
      // tries to measure uplift.
      const [tenantId, decisionId] = rest;
      if (!tenantId || !decisionId) return notFound();

      const body = (await req.json().catch(() => null)) as {
        type?: OutcomeType;
        occurredAt?: string;
        valueMinor?: number | null;
        detail?: Record<string, unknown>;
      } | null;
      if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);
      if (!body.type) {
        return json({ error: 'bad_request', message: 'Missing required field: type' }, 400);
      }
      if (!body.occurredAt) {
        // An input, never the clock — the same rule the decision itself
        // follows, and the reason an outcome can be replayed alongside it.
        return json({ error: 'bad_request', message: 'Missing required field: occurredAt' }, 400);
      }

      const event = {
        tenantId,
        decisionId,
        type: body.type,
        occurredAt: body.occurredAt,
        // Explicitly null when absent: an impression is not a conversion worth
        // nothing, and defaulting to 0 would say it was.
        valueMinor: body.valueMinor ?? null,
        ...(body.detail ? { detail: body.detail } : {}),
      };

      try {
        await store.ledger.recordOutcome(event);
      } catch (e) {
        return json({ error: 'not_found', message: (e as Error).message }, 404);
      }
      return json(event, 201);
    }

    case 'offers': {
      // POST /api/offers/{tenantId} — create an offer.
      //
      // Declared in the spec since it was written and served by nothing: the
      // contract suite exempts it as "covered by a write suite" and no write
      // suite covered it, so a built operation returned 404 and every check
      // agreed that was fine. Found by attempting it.
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');

      const body = (await req.json().catch(() => null)) as Partial<Offer> | null;
      if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);

      // Named rather than defaulted. An offer that a caller half-described and
      // the platform quietly completed is an offer nobody authored.
      const missing = (['key', 'name', 'categoryId', 'objectiveId'] as const).filter(
        (f) => !body[f]
      );
      if (missing.length) {
        return json(
          { error: 'bad_request', message: `Missing required field(s): ${missing.join(', ')}` },
          400
        );
      }

      // The key is the action a decision names, so a duplicate would make two
      // offers indistinguishable in every trace ever written. `packages/
      // catalogue` enforces this with a unique index; here it is a check.
      if (store.offers.some((p) => p.key === body.key)) {
        return json(
          { error: 'conflict', message: `An offer already uses the key '${body.key}'.` },
          409
        );
      }
      if (!store.categories.some((c) => c.id === body.categoryId)) {
        return json(
          { error: 'bad_request', message: `No category '${body.categoryId}'.` },
          400
        );
      }

      // An offer cannot go active with nothing to deliver. `domain.ts` has said
      // "at least one is required to go active" since it was written and
      // enforced it nowhere — so an offer could be active, win a decision, and
      // render nothing. A new offer has no creatives by definition, so this
      // amounts to: create it as a draft, give it content, then activate.
      if ((body.status ?? 'draft') === 'active') {
        return json(
          {
            error: 'conflict',
            message:
              'A new offer cannot be created active: it has no creative yet, and an offer with no active creative cannot be delivered. Create it as a draft, add a creative, then activate.',
          },
          409
        );
      }

      const now = new Date().toISOString();
      const offer: Offer = {
        // Content-addressed ids are for decisions; a catalogue entity is named
        // by its key, which is the thing that has to stay stable.
        id: `prop_${body.key}`,
        key: body.key as string,
        name: body.name as string,
        description: body.description ?? '',
        categoryId: body.categoryId as string,
        objectiveId: body.objectiveId as string,
        // Draft unless the caller says otherwise. An offer that went live the
        // moment it was created would skip every review the platform has.
        status: body.status ?? 'draft',
        financials: body.financials ?? {
          price: { amount: 0, currency: 'GBP' },
          cost: { amount: 0, currency: 'GBP' },
          expectedMargin: { amount: 0, currency: 'GBP' },
          termMonths: 0,
          oneOff: false,
        },
        validity: body.validity ?? { startsAt: now.slice(0, 10), endsAt: null },
        boost: body.boost ?? 1,
        policyIds: body.policyIds ?? [],
        creativeIds: body.creativeIds ?? [],
        tags: body.tags ?? [],
        createdAt: now,
        updatedAt: now,
        updatedBy: user.email,
      };

      store.offers.push(offer);
      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'OfferCreated',
        scope: offer.id,
        summary: `Created ${offer.name} (${offer.key}), status ${offer.status}.`,
      });
      return json(offer, 201);
    }

    case 'creatives': {
      // POST /api/creatives/{tenantId}/{offerId} — give an offer content.
      //
      // Until this existed, the only way to author a creative was to edit
      // apps/console/mocks/fixtures/catalogue.ts and redeploy — which is what
      // `Add creative` in the console still amounts to, since the button has no
      // handler (C-1).
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');

      const [, offerId] = rest;
      const offer = store.offers.find((p) => p.id === offerId);
      if (!offer) return notFound(`No offer ${offerId}`);

      const body = (await req.json().catch(() => null)) as Partial<Creative> | null;
      if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);
      if (!body.channel) {
        return json({ error: 'bad_request', message: 'Missing required field: channel' }, 400);
      }
      if (blankString(body.name)) {
        return json({ error: 'bad_request', message: 'Missing required field: name' }, 400);
      }

      const rejected = creativeProblems(body.channel, body.content as Creative['content']);
      if (rejected) return rejected;

      const id = body.id ?? `trt_${offer.key}_${body.channel}`;
      if (store.creatives.some((c) => c.id === id)) {
        return json({ error: 'conflict', message: `A creative already uses the id '${id}'.` }, 409);
      }

      const now = new Date().toISOString();
      const creative: Creative = {
        id,
        offerId: offer.id,
        name: body.name as string,
        channel: body.channel,
        content: body.content as Creative['content'],
        active: body.active ?? false,
        locale: body.locale ?? 'en-GB',
        createdAt: now,
        updatedAt: now,
      };

      store.creatives.push(creative);
      // `Creative.offerId` is the foreign key — `packages/catalogue` treats it
      // as such and refuses a creative whose offer does not exist. `creativeIds`
      // is a denormalisation the offers list reads for its channel-coverage
      // column, so it is maintained here rather than left to drift.
      if (!offer.creativeIds.includes(creative.id)) offer.creativeIds.push(creative.id);

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'CreativeCreated',
        scope: creative.id,
        summary: `Added ${creative.name} (${creative.channel}) to ${offer.name}${creative.active ? '' : ', inactive'}.`,
      });
      return json(creative, 201);
    }

    case 'decisions': {
      // POST /api/decisions — make a decision.
      //
      // The same operation the JVM service in engines/kotlin serves, against
      // the same spec. Two implementations of one contract is the point: a
      // decision made here and a decision made there carry the same chain
      // hash, which docs/conformance/service-cases.json asserts.
      if (rest.length === 0) {
        const body = (await req.json().catch(() => null)) as {
          artifactId?: string;
          request?: DecisionRequestBody;
        } | null;
        if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);

        // Structure before lookup, so a caller with two problems hears about
        // both rather than fixing them one at a time.
        if (!body.artifactId) {
          return json({ error: 'bad_request', message: 'Missing required field: artifactId' }, 400);
        }
        if (!body.request) {
          return json({ error: 'bad_request', message: 'Missing required field: request' }, 400);
        }
        // Never defaulted to now: a decision that depends on when it was made
        // cannot be replayed.
        if (!body.request.occurredAt) {
          return json(
            { error: 'bad_request', message: 'Missing required field: request.occurredAt' },
            400
          );
        }

        const artifact = execArtifacts.find((a) => a.id === body.artifactId);
        if (!artifact) {
          return json(
            {
              error: 'not_found',
              message: `No artifact '${body.artifactId}'. Loaded: ${execArtifacts
                .map((a) => a.id)
                .sort()
                .join(', ')}`,
            },
            404
          );
        }

        const decisionRequest = {
          tenantId: body.request.tenantId,
          customerId: body.request.customerId,
          channel: body.request.channel,
          placement: body.request.placement,
          occurredAt: body.request.occurredAt,
          input: body.request.input ?? {},
          contactHistory: body.request.contactHistory,
          consent: body.request.consent,
          idempotencyKey: body.request.idempotencyKey,
          correlationId: body.request.correlationId,
        };

        const outcome = await decideAndRecord(artifact, decisionRequest);
        if (outcome.kind === 'error') return outcome.response;
        if (outcome.kind === 'replay') {
          const prior = outcome.record;
          return json(
            { id: prior.id, decision: prior.decision, chainHash: prior.chainHash },
            200,
            { 'Idempotent-Replay': 'true' }
          );
        }

        const trace = outcome.trace;
        return json({ id: trace.id, decision: trace.decision, chainHash: trace.chainHash });
      }

      if (rest[1] !== 'replay') return notFound();

      // A real re-execution, not a canned answer: the engine runs again against
      // the recorded artifact, the catalogue and the original inputs, and the
      // chain hashes are compared. If a policy or boost has since been edited,
      // this legitimately reports a divergence and says which field moved.
      //
      // Seeded decisions carry their request beside them. Everything else is in
      // the ledger, which holds the record — and a record holds
      // `inputSnapshotHash`, never the values, so that a trace can be kept for
      // as long as an audit needs without keeping the customer data it was made
      // from. Replaying one therefore means the caller hands the input back,
      // and the engine's snapshot guard proves it is the right input.
      const seeded = findGenerated(rest[0]);
      const body = (await req.json().catch(() => null)) as {
        input?: Record<string, unknown>;
        contactHistory?: DecisionRequest['contactHistory'];
      } | null;

      let artifact: ExecArtifact;
      let trace: DecisionRecord;
      let input: Record<string, unknown>;
      let contactHistory: DecisionRequest['contactHistory'] | undefined;

      if (seeded) {
        artifact = seeded.artifact;
        trace = seeded.trace;
        // A supplied input still wins: it is the caller asking a different
        // question, and the snapshot guard answers it.
        input = body?.input ?? seeded.request.input;
        contactHistory = body?.contactHistory ?? seeded.request.contactHistory;
      } else {
        const entry = await store.ledger.get('telco-uk', rest[0]);
        if (!entry) return notFound(`No decision with id ${rest[0]}`);

        const published = await store.registry.version(
          entry.tenantId,
          entry.record.decision.artifactId,
          entry.record.decision.artifactVersion
        );
        if (!published) {
          return notFound(
            `Decision ${rest[0]} was made by ${entry.record.decision.artifactId}@${entry.record.decision.artifactVersion}, which the registry does not hold`
          );
        }

        if (!body?.input) {
          return json(
            {
              error: 'input_required',
              message:
                'This decision is recorded and its inputs are not — the platform keeps the snapshot hash, never the values. Supply `input` to replay it.',
            },
            422
          );
        }

        artifact = published.artifact;
        trace = entry.record;
        input = body.input;
        contactHistory = body.contactHistory;
      }

      // The catalogue the decision was made against, by the hash it recorded.
      // Now that the catalogue is editable this is the difference between a
      // replay and a re-decision: today's catalogue would answer a question
      // nobody asked, and would do it while reporting "identical" or a
      // difference that is really an edit.
      const decidedAgainst = catalogueByHash(trace.decision.catalogueSnapshotHash);
      if (!decidedAgainst) {
        return json(
          {
            error: 'catalogue_unavailable',
            message:
              `This decision was made against catalogue ${trace.decision.catalogueSnapshotHash.slice(0, 12)}, ` +
              'which this instance no longer holds. Replaying against a different catalogue would ' +
              'answer a different question, so it is refused rather than approximated.',
            catalogueSnapshotHash: trace.decision.catalogueSnapshotHash,
          },
          409
        );
      }

      const result = replayDecision(artifact, decidedAgainst, trace, input, contactHistory);

      return json({
        identical: result.identical,
        decisionId: result.decisionId,
        replayedAt: new Date().toISOString(),
        artifactVersion: trace.decision.artifactVersion,
        originalWinner: trace.decision.winner,
        replayedWinner: result.identical
          ? trace.decision.winner
          : (result.differences.find((d) => d.path === '$.winner')?.replayed ?? null),
        originalChainHash: result.originalChainHash,
        replayedChainHash: result.replayedChainHash,
        diff: result.differences,
      });
    }

    // POST /api/inbound-calls/clear — empty the buffer.
    //
    // A clear before a demo run is the difference between "these six calls are
    // what the site just did" and scrolling past yesterday's. It records itself
    // — a log whose only row says it was just emptied beats one that is
    // silently empty. Reads of the log are not recorded; see `shouldRecord`.
    case 'inbound-calls': {
      if (rest[0] !== 'clear') return notFound();
      clearCalls();
      return json({ cleared: true });
    }

    case 'targeting-policies': {
      // POST /api/targeting-policies/{tenantId}
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('edit:policies')) return forbidden('edit:policies');
      if (!rest[0]) return notFound();

      const body = (await req.json().catch(() => null)) as Partial<TargetingPolicy> | null;
      if (!body?.name || !body.kind || !body.scope) {
        return json(
          { error: 'bad_request', message: 'name, kind and scope are required.' },
          400
        );
      }

      const refused = policyProblems(body.conditions ?? []);
      if (refused) return refused;

      const now = new Date().toISOString();
      const policy: TargetingPolicy = {
        id: `pol_${Math.random().toString(36).slice(2, 10)}`,
        name: body.name,
        kind: body.kind,
        description: body.description ?? '',
        conditions: body.conditions!,
        scope: body.scope,
        active: body.active ?? false,
        createdAt: now,
        updatedAt: now,
      };
      store.targetingPolicies.push(policy);

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'TargetingPolicyCreated',
        scope: policy.id,
        summary: `Created ${policy.kind} policy '${policy.name}' with ${policy.conditions.length} condition(s).`,
      });

      return json(policy, 201);
    }

    case 'placements': {
      // POST /api/placements/{tenantId}/{placementKey}/decisions — fill a slot.
      //
      // The same decision `POST /decisions` makes, delivered as a slate. The
      // caller names a placement rather than a flow, because which flow answers
      // for a slot is configuration and a website should not be holding it.
      const [tenantId, placementKey, tail] = rest;
      if (!tenantId || !placementKey || tail !== 'decisions') return notFound();

      const placement = store.placements.find(
        (p) => p.key === placementKey && p.active
      );
      if (!placement) {
        return notFound(
          `No active placement '${placementKey}'. Configured: ${store.placements
            .filter((p) => p.active)
            .map((p) => p.key)
            .sort()
            .join(', ')}`
        );
      }

      const body = (await req.json().catch(() => null)) as { request?: DecisionRequestBody } | null;
      if (!body?.request) {
        return json({ error: 'bad_request', message: 'Missing required field: request' }, 400);
      }
      if (!body.request.occurredAt) {
        return json(
          { error: 'bad_request', message: 'Missing required field: request.occurredAt' },
          400
        );
      }
      // The path names the slot. A body that names a different one is two
      // answers to one question, and picking either quietly would put an offer
      // in a slot the caller did not ask about.
      if (body.request.placement && body.request.placement !== placementKey) {
        return json(
          {
            error: 'bad_request',
            message: `Request names placement '${body.request.placement}' and the path names '${placementKey}'.`,
          },
          400
        );
      }

      const artifact = execArtifacts.find((a) => a.id === placement.artifactId);
      if (!artifact) {
        return notFound(
          `Placement '${placementKey}' is answered by flow '${placement.artifactId}', which is not loaded`
        );
      }

      const decisionRequest: DecisionRequest = {
        tenantId: body.request.tenantId,
        customerId: body.request.customerId,
        channel: body.request.channel,
        placement: placement.key,
        occurredAt: body.request.occurredAt,
        input: body.request.input ?? {},
        contactHistory: body.request.contactHistory,
        consent: body.request.consent,
        idempotencyKey: body.request.idempotencyKey,
        correlationId: body.request.correlationId,
      };

      const outcome = await decideAndRecord(artifact, decisionRequest);
      if (outcome.kind === 'error') return outcome.response;

      const record = outcome.kind === 'replay' ? outcome.record : outcome.trace;
      const slate = selectSlate(record.decision, placement.slotCount);

      // The action key is what the decision names; the offer id is what a site
      // needs to fetch content. Resolved from the catalogue the engine read, so
      // the two cannot name different things.
      const offerByKey = new Map(currentCatalogue().offers.map((o) => [o.key, o.id]));

      return json(
        {
          placement: placement.key,
          slotCount: placement.slotCount,
          decisionId: record.id,
          chainHash: record.chainHash,
          entries: slate.entries.map((e) => ({
            ...e,
            offerId: offerByKey.get(e.action) ?? null,
          })),
          unfilled: slate.unfilled,
          rankedCount: slate.ranked.length,
        },
        200,
        outcome.kind === 'replay' ? { 'Idempotent-Replay': 'true' } : undefined
      );
    }

    case 'change-sets': {
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('approve:changes')) return forbidden('approve:changes');

      const cr = store.changeSets.find((c) => c.id === rest[0]);
      if (!cr) return notFound(`No change set ${rest[0]}`);
      if (cr.status !== 'pending') {
        return json(
          {
            error: 'already_decided',
            message: `This change set was already ${cr.status}.`,
          },
          409
        );
      }

      const approving = rest[1] === 'approve';
      if (!approving && rest[1] !== 'reject') return notFound();

      const body = (await req.json().catch(() => ({}))) as { reason?: string };

      cr.status = approving ? 'approved' : 'rejected';
      cr.decidedBy = user.email;
      cr.decidedAt = new Date().toISOString();
      cr.decisionReason =
        body.reason ?? (approving ? 'Approved from the console.' : 'Rejected from the console.');

      // An approved change actually applies its diff to the store.
      if (approving) applyChangeSet(cr);

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: approving ? 'ChangeSetApproved' : 'ChangeSetRejected',
        scope: cr.targetScope.targetId ?? 'tenant',
        summary: `${approving ? 'Approved' : 'Rejected'} ${cr.id}: ${cr.title}`,
        changeSetId: cr.id,
      });

      return json(cr);
    }

    // Test-only: restore seed state between E2E specs.
    case 'registry': {
      await store.registryReady;

      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);

      const tenantId = rest[0];
      const flowName = rest[1];
      if (!tenantId || !flowName) return notFound();

      // POST /registry/{tenant}/{flow}/shadow — start or stop a shadow.
      //
      // Gated on promote:flows, not a permission of its own. Deciding what runs
      // in production, even beside the active version, is the same authority —
      // and a shadow is the step before a cutover, so whoever can do one should
      // be the one setting up the evidence for it.
      if (rest[2] === 'shadow') {
        if (!user.permissions.includes('promote:flows')) {
          return forbidden('promote:flows');
        }
        const body = (await req.json().catch(() => ({}))) as {
          version?: string | null;
          environment?: string;
        };
        if (!body.environment) {
          return json({ error: 'bad_request', message: 'Missing required field: environment' }, 400);
        }

        try {
          // A null version stops the shadow. Explicit rather than a separate
          // verb, because "what is shadowing" is one piece of state.
          const state = body.version
            ? await store.registry.startShadow(
                tenantId, flowName, body.version, body.environment,
                user.email, new Date().toISOString()
              )
            : await store.registry.stopShadow(
                tenantId, flowName, body.environment, user.email, new Date().toISOString()
              );

          recordAudit({
            actor: user.email,
            actorType: 'human',
            eventType: body.version ? 'ShadowStarted' : 'ShadowStopped',
            scope: `flow:${flowName}`,
            summary: body.version
              ? `${flowName} ${body.version} now shadowing in ${body.environment}`
              : `${flowName} stopped shadowing in ${body.environment}`,
            changeSetId: null,
          });

          return json(state);
        } catch (e) {
          const err = e as { code?: string; message?: string };
          const status = err.code === 'UNKNOWN_VERSION' ? 404 : 409;
          return json({ error: err.code ?? 'registry_error', message: err.message }, status);
        }
      }

      // POST /registry/{tenant}/{flow}/promote
      if (rest[2] === 'promote' || rest[2] === 'rollback') {
        if (!user.permissions.includes('promote:flows')) {
          return forbidden('promote:flows');
        }
        const body = (await req.json().catch(() => ({}))) as {
          version?: string;
          environment?: string;
        };
        if (!body.environment) {
          return json({ error: 'bad_request', message: 'Missing required field: environment' }, 400);
        }

        try {
          const state =
            rest[2] === 'promote'
              ? await store.registry.promote(
                  tenantId,
                  flowName,
                  body.version ?? '',
                  body.environment,
                  user.email,
                  new Date().toISOString()
                )
              : await store.registry.rollback(
                  tenantId,
                  flowName,
                  body.environment,
                  user.email,
                  new Date().toISOString()
                );

          recordAudit({
            actor: user.email,
            actorType: 'human',
            eventType: rest[2] === 'promote' ? 'VersionPromoted' : 'VersionRolledBack',
            scope: `flow:${flowName}`,
            summary:
              rest[2] === 'promote'
                ? `Promoted ${flowName} ${body.version} to ${body.environment}`
                : `Rolled ${flowName} in ${body.environment} back to ${state.activeVersion}`,
            changeSetId: null,
          });

          return json(state);
        } catch (e) {
          const err = e as { code?: string; message?: string };
          // A version that was never published is a 404; everything else the
          // registry refuses is a conflict with the current state.
          const status = err.code === 'UNKNOWN_VERSION' ? 404 : 409;
          return json({ error: err.code ?? 'registry_error', message: err.message }, status);
        }
      }

      // POST /registry/{tenant}/{flow} — publish
      if (!user.permissions.includes('publish:flows')) {
        return forbidden('publish:flows');
      }
      const body = (await req.json().catch(() => ({}))) as {
        version?: string;
        source?: DecisionFlowSource;
      };
      if (!body.version) {
        return json({ error: 'bad_request', message: 'Missing required field: version' }, 400);
      }
      if (!body.source) {
        return json({ error: 'bad_request', message: 'Missing required field: source' }, 400);
      }

      const outcome = await store.registry.publish(
        {
          tenantId,
          flowName,
          version: body.version,
          source: body.source,
          actor: user.email,
          occurredAt: new Date().toISOString(),
        },
        compileContext
      );

      if (outcome.status !== 'rejected') {
        recordAudit({
          actor: user.email,
          actorType: 'human',
          eventType: 'ArtifactPublished',
          scope: `flow:${flowName}`,
          summary: `${outcome.status === 'published' ? 'Published' : 'Republished (unchanged)'} ${flowName} ${body.version}`,
          changeSetId: null,
        });
      }

      // 409, not 400: the request was well-formed and the registry refused it
      // on its own rules. A caller retrying the identical payload gets the
      // identical answer, which 4xx-with-a-body is the right shape for.
      return json(outcome, outcome.status === 'rejected' ? 409 : 201);
    }

    case '_test': {
      // POST /api/_test/drain — wait for shadow work to finish.
      //
      // The shadow is deliberately not awaited on the request path, so a test
      // that asserts on a comparison has to wait for one. This is the honest
      // way to do that: sleeping would be a flake with a timer attached.
      if (rest[0] === 'drain') {
        await Promise.all([...store.shadowInFlight]);
        return json({ drained: true });
      }

      if (rest[0] !== 'reset') return notFound();
      if (process.env.NODE_ENV === 'production') return notFound();
      resetStore();
      return json({ reset: true });
    }

    default:
      return notFound(`No route for /${path.join('/')}`);
  }
}

/**
 * Apply an approved change set's diff to the store.
 *
 * Only the change types the console can currently raise are handled; anything
 * else is approved for the record but leaves the data untouched, which is
 * honest rather than silently pretending.
 */
function applyChangeSet(cr: (typeof store.changeSets)[number]) {
  switch (cr.changeType) {
    case 'arbitration_weights': {
      for (const d of cr.diff) {
        const key = d.field.replace(/^weights\./, '') as keyof typeof store.arbitration.weights;
        if (key in store.arbitration.weights) {
          store.arbitration.weights[key] = Number(d.after);
        }
      }
      const w = store.arbitration.weights;
      store.arbitration.formula = `Priority = P^${w.propensity.toFixed(2)} × V^${w.value.toFixed(
        2
      )} × B^${w.boost.toFixed(2)} × C^${w.context.toFixed(2)}`;
      break;
    }
    case 'boost_adjust': {
      for (const d of cr.diff) {
        const boostId = d.field.split('.')[0];
        const boost = store.boosts.find((l) => l.id === boostId);
        if (boost) boost.value = Number(d.after);
      }
      break;
    }
    case 'policy_edit': {
      for (const d of cr.diff) {
        // e.g. "pol_heavy_user.conditions[0].value"
        const match = d.field.match(/^(\w+)\.conditions\[(\d+)\]\.value$/);
        if (match) {
          const policy = store.targetingPolicies.find((p) => p.id === match[1]);
          const cond = policy?.conditions[Number(match[2])];
          if (cond) cond.value = Number(d.after);
          continue;
        }
        const activeMatch = d.field.match(/^(\w+)\.active$/);
        if (activeMatch) {
          const policy = store.targetingPolicies.find((p) => p.id === activeMatch[1]);
          if (policy) policy.active = d.after === 'true';
        }
      }
      break;
    }
    case 'offer_retire': {
      const prop = store.offers.find((p) => p.id === cr.targetScope.targetId);
      if (prop) prop.status = 'retired';
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

async function handlePut(req: Request, { params }: Ctx) {
  const { path } = await params;
  const [head, ...rest] = path;
  const user = actor(req);
  if (!user) return json({ error: 'no_session' }, 401);

  switch (head) {
    case 'targeting-policies': {
      // PUT /api/targeting-policies/{tenantId}/{policyId}
      if (!user.permissions.includes('edit:policies')) return forbidden('edit:policies');
      const [, policyId] = rest;
      if (!policyId) return notFound();

      const existing = store.targetingPolicies.find((p) => p.id === policyId);
      if (!existing) return notFound(`No policy ${policyId}`);

      const body = (await req.json().catch(() => null)) as Partial<TargetingPolicy> | null;
      if (!body) return json({ error: 'bad_request', message: 'Body required.' }, 400);

      const conditions = body.conditions ?? existing.conditions;
      const refused = policyProblems(conditions);
      if (refused) return refused;

      // Mutated in place rather than replaced: `currentCatalogue()` reads
      // `store.targetingPolicies`, and swapping the array element would be
      // equivalent — but other references to this object are held elsewhere in
      // the store, and two policies with one id is worse than either.
      existing.name = body.name ?? existing.name;
      existing.kind = body.kind ?? existing.kind;
      existing.description = body.description ?? existing.description;
      existing.conditions = conditions;
      existing.scope = body.scope ?? existing.scope;
      if (typeof body.active === 'boolean') existing.active = body.active;
      existing.updatedAt = new Date().toISOString();

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'TargetingPolicyChanged',
        scope: existing.id,
        summary: `Updated ${existing.kind} policy '${existing.name}'.`,
      });

      return json(existing);
    }

    case 'arbitration': {
      if (!user.permissions.includes('edit:arbitration')) return forbidden('edit:arbitration');
      const body = (await req.json().catch(() => ({}))) as Partial<typeof store.arbitration>;
      if (body.weights) store.arbitration.weights = { ...store.arbitration.weights, ...body.weights };
      const w = store.arbitration.weights;
      store.arbitration.formula = `Priority = P^${w.propensity.toFixed(2)} × V^${w.value.toFixed(
        2
      )} × B^${w.boost.toFixed(2)} × C^${w.context.toFixed(2)}`;
      store.arbitration.updatedAt = new Date().toISOString();
      store.arbitration.updatedBy = user.email;

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'ArbitrationWeightsChanged',
        scope: 'tenant',
        summary: `Arbitration weights set to ${store.arbitration.formula}`,
      });
      return json(store.arbitration);
    }

    case 'connectors': {
      // Integrations decide what a decision can see, so editing one is a
      // governed action, not a preference.
      if (!user.permissions.includes('edit:integrations')) return forbidden('edit:integrations');
      const body = (await req.json().catch(() => ({}))) as Partial<
        (typeof store.connectors)[number]
      >;
      const connector = store.connectors.find((c) => c.id === rest[1]);
      if (!connector) return notFound(`No connector ${rest[1]}`);

      const before = { active: connector.active, cacheTtlSeconds: connector.cacheTtlSeconds };
      if (typeof body.active === 'boolean') connector.active = body.active;
      if (typeof body.cacheTtlSeconds === 'number') {
        connector.cacheTtlSeconds = body.cacheTtlSeconds;
      }
      if (typeof body.onFailure === 'string') connector.onFailure = body.onFailure;
      connector.updatedAt = new Date().toISOString();
      connector.updatedBy = user.email;

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'ConnectorChanged',
        scope: `connector:${connector.id}`,
        summary:
          `${connector.name}: active ${before.active} to ${connector.active}, ` +
          `cache ${before.cacheTtlSeconds}s to ${connector.cacheTtlSeconds}s`,
        changeSetId: null,
      });
      return json(connector);
    }

    case 'autonomy': {
      if (!user.permissions.includes('edit:autonomy')) return forbidden('edit:autonomy');
      const body = (await req.json().catch(() => ({}))) as { id?: string; level?: string };
      const setting = store.autonomy.find((s) => s.id === body.id);
      if (!setting) return notFound(`No autonomy setting ${body.id}`);

      const before = setting.level;
      Object.assign(setting, body, {
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      });

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'AutonomyChanged',
        scope: setting.scope.targetId ?? 'tenant',
        summary: `Autonomy for ${setting.scope.level} changed from ${before} to ${setting.level}.`,
      });
      return json(setting);
    }

    case 'creatives': {
      // PUT /api/creatives/{tenantId}/{offerId}/{creativeId}
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');
      const [, offerId, creativeId] = rest;

      const offer = store.offers.find((p) => p.id === offerId);
      if (!offer) return notFound(`No offer ${offerId}`);
      const index = store.creatives.findIndex(
        (c) => c.id === creativeId && c.offerId === offerId
      );
      if (index === -1) return notFound(`No creative ${creativeId} on offer ${offerId}`);

      const before = store.creatives[index];
      const body = (await req.json().catch(() => ({}))) as Partial<Creative>;
      const updated: Creative = {
        ...before,
        ...body,
        id: before.id,
        offerId: before.offerId,
        updatedAt: new Date().toISOString(),
      };

      const rejected = creativeProblems(updated.channel, updated.content);
      if (rejected) return rejected;

      // Switching off the last active creative of an active offer would leave
      // the offer winning decisions with nothing to render. Refused rather than
      // cascaded: retiring somebody's offer because they edited a creative is
      // not a decision this endpoint gets to make.
      if (before.active && !updated.active && offer.status === 'active') {
        const remaining = store.creatives.filter(
          (c) => c.offerId === offerId && c.id !== creativeId
        );
        if (!offerMayBeActive(remaining)) {
          return json(
            {
              error: 'conflict',
              message: `'${before.name}' is the only active creative on '${offer.name}', which is active. Pause or retire the offer first.`,
            },
            409
          );
        }
      }

      store.creatives[index] = updated;

      const changed = Object.keys(body).filter(
        (k) =>
          JSON.stringify((before as unknown as Record<string, unknown>)[k]) !==
          JSON.stringify((body as Record<string, unknown>)[k])
      );
      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'CreativeUpdated',
        scope: updated.id,
        summary: `Updated ${updated.name}${changed.length ? ` (${changed.join(', ')})` : ''}.`,
      });
      return json(updated);
    }

    case 'offers': {
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');
      const offerId = rest[1];
      const index = store.offers.findIndex((p) => p.id === offerId);
      if (index === -1) return notFound(`No offer ${offerId}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const before = store.offers[index];

      // Same invariant as creation, at the other moment it can be broken.
      if (body.status === 'active' && before.status !== 'active') {
        const own = store.creatives.filter((c) => c.offerId === before.id);
        if (!offerMayBeActive(own)) {
          return json(
            {
              error: 'conflict',
              message: `'${before.name}' has no active creative, so it cannot be activated — it would win decisions with nothing to render.`,
            },
            409
          );
        }
      }

      const updated = {
        ...before,
        ...body,
        id: before.id,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      };
      store.offers[index] = updated;

      const changed = Object.keys(body).filter(
        (k) => JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify(body[k])
      );

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'OfferUpdated',
        scope: offerId,
        summary: `Updated ${updated.name}${changed.length ? ` (${changed.join(', ')})` : ''}.`,
      });
      return json(updated);
    }

    default:
      return notFound(`No route for /${path.join('/')}`);
  }
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * The handlers above are wrapped rather than instrumented case by case.
 *
 * Forty-odd cases each recording their own call is forty places to forget one,
 * and the ones that would get forgotten are the error paths — which are the
 * calls worth having. Wrapping records every route, including the ones added
 * after this comment.
 */
export const GET = recorded('GET', handleGet);
export const POST = recorded('POST', handlePost);
export const PUT = recorded('PUT', handlePut);
