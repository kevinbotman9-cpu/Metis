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
import { readFileSync } from 'node:fs';
// Not `path`: the handlers name the request's segments that.
import * as nodePath from 'node:path';
import { store, resetStore, recordAudit, ResetRefused } from '@/mocks/store';
import type { TenantSettings } from '@metis/core/domain';
import {
  findTrace,
  decisions,
  findGeneratedDecision,
  toApiTrace,
  corpusFunnelRows,
} from '@/mocks/fixtures/decisions';
import type { GeneratedDecision } from '@/mocks/fixtures/engine';
import { seededOutcomeMap, seededOutcomesFor } from '@/mocks/fixtures/outcomes';
import { provenanceFor, provenanceOver } from '@/mocks/provenance';
import {
  IdempotencyConflict,
  compareShadow,
  buildShadowReport,
  type ShadowComparison,
  resolveInputs,
  selectSlate,
  resolveAggregations,
  mergeAggregations,
  IntegrationError,
  HttpIntegrationGateway,
  MemoryIntegrationCache,
} from '@metis/runtime';
import type { IntegrationGateway } from '@metis/runtime';
import { RecordedIntegrationGateway } from '@/mocks/gateway';
import { recorded, listCalls, clearCalls, isEnabled as callLogEnabled } from '@/mocks/call-log';
import type { DecisionRecord } from '@metis/runtime';
import type { OutcomeType } from '@metis/ledger';
import { buildPerformance, buildPolicyFunnel, funnelDecisionOf, type FunnelStageId } from '@metis/ledger';
import type {
  ArbitrationConfig,
  Category,
  Connector,
  Creative,
  Objective,
  Offer,
  Placement,
} from '@metis/core/domain';
import { validateCreativeContent, offerMayBeActive } from '@metis/core/creative';
import {
  conditionProblems,
  listFieldPaths,
  schemaProblems,
  operatorsFor,
  typeOf,
  type ProfileSchema,
} from '@metis/core/profile-schema';
import type { TargetingPolicy } from '@metis/core/domain';
import {
  assignAll,
  assignArm,
  armPath,
  experimentProblems,
  editProblems,
  type Experiment,
} from '@metis/core/experiment';
import {
  validateRows,
  activationProblems,
  type DataSourceDefinition,
  type FieldMapping,
} from '@metis/core/intake';
import { catalogueSnapshot } from '@/mocks/fixtures/engine';
import {
  currentCatalogue,
  catalogueByHash,
  registerCatalogue,
  readCatalogue,
  snapshotFrom,
} from '@/mocks/catalogue-state';
import { CONSOLE_TENANT } from '@/mocks/catalogue-source';
import { CatalogueError, type CatalogueSnapshotRecord } from '@metis/catalogue';
import { GovernanceError, type ChangeSet, type ChangeSetStatus } from '@metis/governance';
import {
  findCompilation,
  compileContextFor,
  compileSourcesFrom,
  toSource,
} from '@/mocks/fixtures/compiled';
import { compileDecisionFlow } from '@metis/compiler/decision-flow/compile';
import type { ArtifactSummary } from '@/mocks/fixtures/artifacts';
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
      // Both sides of the pair, or there is nothing to compare and nothing the
      // registry would accept as evidence.
      if (!env?.shadowVersion || !env.activeVersion) return;
      const pair = { activeVersion: env.activeVersion, shadowVersion: env.shadowVersion };

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
        catalogueByHash(active.decision.catalogueSnapshotHash) ?? (await currentCatalogue());
      const shadow = executeDecision(shadowArtifact, catalogue, request);
      const shadowMs = performance.now() - started;

      // Into the registry beside the shadow pointer, not an array here. The
      // pointer has always persisted in `registry_environments`; until
      // 2026-09-14 its evidence did not, so a shadow that ran for a week had
      // nothing to show after a restart.
      await store.registry.recordShadowComparison<ShadowComparison>({
        tenantId: request.tenantId,
        flowName: active.decision.artifactId,
        environment: 'production',
        ...pair,
        recordedAt: new Date().toISOString(),
        comparison: compareShadow(active, shadow, pair, shadowMs),
      });
    } catch {
      // Deliberately silent. The decision already went out.
    }
  })();

  store.shadowInFlight.add(done);
  await done.finally(() => store.shadowInFlight.delete(done));
}

/**
 * How many landed rows are held per source.
 *
 * A bound rather than a policy. These are customer records in their original
 * shape and ADR-004 has not decided how they are retained, so the pipeline is
 * built to make a bad import finite rather than to make retention someone
 * else's problem later.
 */
const MAX_LANDED_ROWS = 5000;


/**
 * The artifact a decision should run: the version promoted to production.
 *
 * Decisions used to execute `execArtifacts`, derived from the fixture modules
 * at import — so editing a flow changed nothing, exactly as editing the
 * catalogue used to. This is the same seam one layer up, and it closes the
 * same way, except that flows already have the machinery: they are compiled,
 * versioned, published and promoted, and the registry holds every version.
 *
 * So the resolution order is the governance model rather than a convenience.
 * An edit reaches decisions when it is published and promoted, not when it is
 * saved — which is the difference between a console and a deploy.
 *
 * The fallback exists for a flow the registry has never accepted. Answering
 * "no such flow" for something the placement configuration names would be a
 * worse failure than running the last artifact known to work, and the
 * compile-and-publish path is where a broken flow is supposed to be stopped.
 *
 * Chain hashes do not move: the record carries `artifactId`, `artifactVersion`,
 * `packageVersions` and `candidateKeys`, none of which differ between the two
 * copies. The published artifact additionally carries `compiledAt` and a cost
 * manifest, and the engine reads neither.
 */
async function artifactFor(tenantId: string, flowId: string): Promise<ExecArtifact | undefined> {
  await store.registryReady;
  try {
    const env = await store.registry.environment(tenantId, flowId, 'production');
    if (env?.activeVersion) {
      const published = await store.registry.version(tenantId, flowId, env.activeVersion);
      if (published) return published.artifact;
    }
  } catch {
    // A registry that cannot answer is not a reason to refuse the decision.
  }
  return execArtifacts.find((a) => a.id === flowId);
}


/**
 * What a flow compiles against, from the store rather than the fixtures.
 *
 * Publish used the fixture `compileContext`, so a policy or offer created
 * through the console was invisible to the compiler at publish time — a flow
 * naming one would be rejected for referencing something that, as far as the
 * compiler could see, did not exist. Same seam as the catalogue and the
 * artifacts, in the one place it would have been hardest to notice.
 */
async function currentCompileContext(artifactId?: string) {
  // The one builder, over the store rather than the fixtures. Three copies of
  // this existed until 2026-09-11 and two of them disagreed, which is how a
  // flow came to be live and shown as broken at the same time (G-071).
  // Registry seeding reads the stored catalogue through the same builder.
  return compileContextFor(artifactId ?? '', compileSourcesFrom(await readCatalogue()));
}

/**
 * A flow as a person last saved it, from the registry.
 *
 * Drafts were `store.artifacts`, an array seeded from the fixtures every start
 * and edited in place. They are registry state now, so a saved graph survives a
 * restart beside the versions published from it, and a read hands back a copy.
 */
async function flowDraft(flowId: string): Promise<ArtifactSummary | undefined> {
  await store.registryReady;
  return (await store.registry.draft<ArtifactSummary>(CONSOLE_TENANT, flowId))?.draft;
}

/** Every flow's draft, in flow-id order — the order the store reads in. */
async function flowDrafts(): Promise<ArtifactSummary[]> {
  await store.registryReady;
  return (await store.registry.drafts<ArtifactSummary>(CONSOLE_TENANT)).map((d) => d.draft);
}

/**
 * The tenant's data model, which a store this console seeded always holds.
 *
 * Nullable in the store, because a tenant can exist before it is configured.
 * This console's tenant never does, so a missing schema means the store was
 * not seeded here — said, rather than answered with an empty model that would
 * make every condition look invalid.
 */
function schemaOf(cat: CatalogueSnapshotRecord): ProfileSchema {
  if (!cat.profileSchema) {
    throw new Error(
      `Tenant '${CONSOLE_TENANT}' has no profile schema in its catalogue. A store this console seeded always has one.`
    );
  }
  return cat.profileSchema;
}

/**
 * When this process started serving, near enough.
 *
 * Module load, not `process.uptime()`, because a Next dev server re-evaluates
 * route modules on change and what matters is how long *this* state has been
 * accumulating rather than how long the shell has been alive.
 *
 * Read by `tests/global-setup.ts`, which refuses a reused server older than
 * two hours. See G-035: one that had been up seventeen hours ran two
 * accessibility tests in ten minutes where a fresh one ran forty-nine in under
 * three.
 */

const STARTED_AT = new Date().toISOString();

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers });
const notFound = (message = 'Not found') => json({ error: 'not_found', message }, 404);
const forbidden = (permission: string) =>
  json(
    { error: 'forbidden', message: `This action requires the ${permission} permission.` },
    403
  );

/**
 * The tenant's currency and content locale, from its settings. G-092.
 *
 * Both were hardcoded — `GBP` and `en-GB` — and the fix on 2026-09-12 derived
 * them instead from whichever offer and creative were first in the catalogue.
 * That was a workaround wearing a fix's clothes: the first offer is not a
 * statement about the tenant, and a tenant whose first offer was priced in
 * euros would have authored every new offer in euros. Nothing held the answer,
 * so the tenant now does.
 */
function tenantCurrency(): TenantSettings['currency'] {
  return store.tenantSettings.currency;
}

function tenantLocale(): string {
  return store.tenantSettings.locale;
}

/** The currencies `Money` can hold. An amount in any other is not an amount this domain can store. */
const TENANT_CURRENCIES: readonly TenantSettings['currency'][] = ['USD', 'GBP', 'EUR'];

/**
 * What is wrong with a settings body, per field.
 *
 * A locale is accepted only if the runtime can format in it: an unknown tag
 * would not fail, it would silently fall back to the runtime's default, which is
 * the bug this setting exists to remove.
 */
function tenantSettingsProblems(body: Record<string, unknown>): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  if (body.locale !== undefined) {
    let supported = false;
    try {
      supported =
        typeof body.locale === 'string' &&
        Intl.DateTimeFormat.supportedLocalesOf([body.locale]).length === 1 &&
        Intl.NumberFormat.supportedLocalesOf([body.locale]).length === 1;
    } catch {
      supported = false;
    }
    if (!supported) {
      problems.push({
        field: 'locale',
        message: `'${String(body.locale)}' is not a locale this runtime can format dates and numbers in.`,
      });
    }
  }
  if (body.currency !== undefined && !TENANT_CURRENCIES.includes(body.currency as TenantSettings['currency'])) {
    problems.push({
      field: 'currency',
      message: `Amounts are held in ${TENANT_CURRENCIES.join(', ')}; '${String(body.currency)}' is not one of them.`,
    });
  }
  return problems;
}

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
function policyProblems(conditions: TargetingPolicy['conditions'], schema: ProfileSchema) {
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
    for (const p of conditionProblems(schema, condition)) {
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

/**
 * The channels something actually carries to a customer.
 *
 * `delivery`, not `decidable` — ADR-013 §2. What `/performance` needs for the
 * stage its loop breaks at, and what the coverage screen measures against.
 */
const deliverableChannels = (placements: Placement[]): string[] => [
  ...new Set(placements.filter((p) => p.delivery).map((p) => p.channel)),
];

/**
 * The channels this tenant decides on at all.
 *
 * What `offerMayBeActive` wants, and **not** the channels anything delivers on.
 * An offer with content only on a channel nobody has a slot for is
 * undeliverable in a way the author can fix; one whose channel has a slot and
 * no adapter is not. The second is W-017's problem, and it is shown on
 * `/placements` and the coverage screen rather than blocking authoring.
 *
 * This read `p.active` until 2026-09-10, when ADR-013 split that flag into the
 * two questions it was answering at once. The deliverable half is computed on
 * the coverage screen, from the placements it already reads — it is a property
 * of what is on screen rather than a rule the API applies, so keeping a second
 * copy here would be a second place for it to drift.
 */
const decidableChannels = (placements: Placement[]): string[] => [
  ...new Set(placements.filter((p) => p.decidable).map((p) => p.channel)),
];

/**
 * The channels one flow's slots are *decided* for.
 *
 * A different question from `deliverableChannels`, and the compiler wants this
 * one. `NO_DELIVERABLE_CREATIVE` asks whether an offer has content for a
 * channel it could win on; whether anything then sends that content is a
 * property of the channel, surfaced on `/placements` and on the coverage
 * screen, and not a reason to refuse an offer.
 *
 * Using the deliverable set here — which this did briefly on 2026-09-10 —
 * refuses `next-best-action` outright, because it answers an sms slot and an
 * offer with only an sms creative then looks undeliverable. The offer is fine.
 * The channel has no adapter. Conflating the two is the exact error ADR-013
 * exists to end, made in the other direction.
 */
/**
 * Record what the platform did about delivering one decision — ADR-013 §1.
 *
 * Phase one writes two of the six states, because phase one has no adapter:
 *
 *   `dispatched` the slate went back to whoever asked, and for a `caller`
 *                placement that *is* the delivery. Web has always worked this
 *                way; the model now says so rather than leaving it implied.
 *   `suppressed` nothing delivers this slot. `no_adapter` where the placement
 *                has no delivery mode at all, `adapter_not_built` where it
 *                names one — which nothing can satisfy until W-017, and W-017
 *                is blocked on W-008 because no recipient address exists
 *                anywhere in the profile schema.
 *
 * Swallowing the failure is deliberate and narrow: a decision that succeeded
 * must not be turned into an error because the platform could not write a note
 * about itself. The note is not the decision.
 */
/**
 * Read `delivery` off a request body, treating an empty mode as none.
 *
 * The form offers three choices and the first is "nothing sends it", which
 * arrives as `{ mode: '' }` because a select's empty option is an empty string.
 * Storing that would give the slot a delivery mode that is neither `caller` nor
 * `adapter`, and every reader tests truthiness of `delivery` rather than of
 * `delivery.mode`. Normalised once, here, rather than in each of them.
 */
function normaliseDelivery(value: unknown): Placement['delivery'] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const mode = (value as { mode?: unknown }).mode;
  if (mode !== 'caller' && mode !== 'adapter') return null;
  const adapterId = (value as { adapterId?: unknown }).adapterId;
  return mode === 'adapter' && typeof adapterId === 'string' && adapterId.trim() !== ''
    ? { mode, adapterId }
    : { mode };
}

async function recordDeliveryFor(
  placement: { key: string; channel: string; delivery: { mode: string } | null },
  decisionId: string,
  tenantId: string
): Promise<void> {
  const suppressed = !placement.delivery
    ? 'no_adapter'
    : placement.delivery.mode === 'adapter'
      ? 'adapter_not_built'
      : null;

  try {
    await store.ledger.recordDelivery({
      tenantId,
      decisionId,
      placementKey: placement.key,
      channel: placement.channel,
      state: suppressed ? 'suppressed' : 'dispatched',
      at: new Date().toISOString(),
      reason: suppressed,
      permanent: null,
      providerRef: null,
    });
  } catch {
    // The ledger refuses an attempt whose decision it cannot find, which is
    // the right refusal and not this caller's to escalate.
  }
}

function creativeProblems(
  channel: Creative['channel'],
  content: Creative['content'],
  placements: Placement[]
) {
  const problems = validateCreativeContent(channel, content);

  // The slot key is checked here rather than in `@metis/core`, because which
  // slots exist is tenant configuration and that package cannot see it. A
  // creative naming a slot nobody configured would simply never be chosen —
  // silently, which is the worst way for content to fail.
  if (channel === 'web') {
    const named = (content as { placement?: string }).placement;
    if (named && !placements.some((p) => p.key === named)) {
      problems.push({
        field: 'content.placement',
        message: `No placement '${named}'. Configured: ${placements
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
  decisionRequest: DecisionRequest,
  /** The catalogue read the caller already made, so one request is one moment. */
  read?: CatalogueSnapshotRecord
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
  const cat = read ?? (await readCatalogue());
  const catalogue = snapshotFrom(cat);

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

  // Rollups over child records, computed after connectors and before the
  // engine. They enter the hashed input as ordinary numbers, so the value a
  // decision saw is part of what was decided and replay stays exact.
  //
  // An absent collection produces nothing rather than zero — `active_count`
  // of 0 would make `active_count < 2` true and send an offer to somebody
  // whose accounts were never loaded. `unresolved` carries the difference.
  const rolled = resolveAggregations(schemaOf(cat), resolvedInputs.input);

  // Experiment arms, assigned before the core and hashed with the input.
  //
  // An arm is a pure function of the customer reference, so nothing is written
  // down: a decision record stores `customerRef`, and the arm is recomputed
  // from it when the decision is explained months later. That is why a running
  // experiment cannot be reweighted — the recomputed arm would stop matching
  // the one that applied.
  const arms = assignAll(cat.experiments, decisionRequest.customerId);

  // Fields the caller supplied win, which `resolveInputs` guarantees; the
  // 60 service cases carry theirs, which is why they still hash the same.
  const resolvedRequest = {
    ...decisionRequest,
    input: {
      ...mergeAggregations(resolvedInputs.input, rolled.values),
      // Nested under `experiments` so a policy names `experiments.<key>` and
      // `readPath` can walk to it.
      ...(Object.keys(arms.values).length > 0
        ? {
            experiments: Object.fromEntries(
              arms.assignments.map((a) => [a.experimentKey, a.arm])
            ),
          }
        : {}),
    },
  };

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
  // The ledger's store is chosen asynchronously, because reaching a database
  // is. Awaited once per request rather than at import: a configured database
  // that cannot be reached must fail the request that needed it rather than
  // stop the process from starting, and it must never fall through to storage
  // that forgets. Resolves immediately when no database is configured.
  await store.ledgerReady;

  switch (head) {
    case 'auth': {
      if (rest[0] !== 'session') return notFound();
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      return json({ user: publicUser(user) });
    }

    case 'taxonomy': {
      const cat = await readCatalogue();
      return json({
        objectives: cat.objectives,
        categories: cat.categories,
        offers: cat.offers,
      });
    }

    case 'offers': {
      const offerId = rest[1];
      const cat = await readCatalogue();
      if (offerId) {
        const offer = cat.offers.find((p) => p.id === offerId);
        if (!offer) return notFound(`No offer ${offerId}`);
        return json({
          offer,
          creatives: cat.creatives.filter((t) => t.offerId === offer.id),
          policies: cat.targetingPolicies.filter((p) =>
            offer.policyIds.includes(p.id)
          ),
          autonomy: resolveAutonomyFor(
            offer.id,
            offer.categoryId,
            offer.objectiveId
          ),
        });
      }

      let result = cat.offers;
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
      const cat = await readCatalogue();
      if (offerId) {
        return json({ creatives: cat.creatives.filter((t) => t.offerId === offerId) });
      }

      let result = cat.creatives;
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
        const offerKey = new Map(cat.offers.map((o) => [o.id, o.key]));
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
      const { targetingPolicies } = await readCatalogue();
      return json({
        policies: kind ? targetingPolicies.filter((p) => p.kind === kind) : targetingPolicies,
      });
    }

    case 'frequency-policies':
      return json({ policies: (await readCatalogue()).frequencyPolicies });

    case 'arbitration': {
      const cat = await readCatalogue();
      return json({ config: cat.arbitration, boosts: cat.boosts });
    }

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
        const page = sorted.slice(0, limit);
        return json({
          decisions: page,
          total: sorted.length,
          provenance: provenanceOver(page.map((d) => d.id)),
        });
      }

      if (rest[1] === 'trace') {
        const trace = findTrace(rest[0]);
        if (trace) return json({ ...trace, provenance: provenanceFor(rest[0]) });
        // Seeded decisions are the console's flattened display shape; anything
        // executed since is in the ledger as real engine output. Before the
        // ledger existed, POST /decisions returned an id this endpoint then
        // said did not exist.
        // The development store is single-tenant, and the trace route
        // carries no tenant segment. A multi-tenant deployment resolves this
        // from the caller's session rather than a constant.
        const entry = await store.ledger.get('telco-us', rest[0]);
        // Projected, not returned raw. `entry.record` is the *runtime*
        // `DecisionRecord` — `{ id, decision: {...} }` — and the spec declares
        // the flat API one. Returning the runtime shape here answered 200 with
        // a body the page threw on, for every decision the storefront made,
        // from the day live decisions became possible until 2026-09-09.
        if (entry) {
          return json({
            ...toApiTrace(entry.record as unknown as GeneratedDecision['trace']),
            provenance: provenanceFor(rest[0]),
          });
        }
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
      // Seeded first, then anything recorded against it — same merge and same
      // reason as the report, so the trace and the rate cannot disagree about
      // what happened to one decision.
      const seededTrace = decisions.find((d) => d.id === decisionId);
      const recorded = await store.ledger.outcomesFor(tenantId, decisionId);
      const seededEvents = seededTrace ? seededOutcomesFor(seededTrace) : [];
      return json({
        outcomes: [...seededEvents, ...recorded],
        provenance:
          seededEvents.length > 0 && recorded.length > 0
            ? provenanceOver([decisionId, 'live'])
            : provenanceFor(decisionId),
      });
    }

    case 'deliveries': {
      // GET /api/deliveries/{tenantId}/{decisionId} — ADR-013 §1.
      const [tenantId, decisionId] = rest;
      if (!tenantId || !decisionId) return notFound();
      const known =
        Boolean(findTrace(decisionId)) || Boolean(await store.ledger.get(tenantId, decisionId));
      if (!known) return notFound(`No decision with id ${decisionId}`);

      // Recorded only, and no seeded projection beside it. The seeded corpus
      // predates the ledger and nothing ever attempted to deliver those
      // decisions; inventing a `suppressed` row for each would be the platform
      // asserting it tried, which is the opposite of what this record is for.
      // What the corpus *cannot* deliver is a property of its placements and is
      // shown on the coverage screen, not fabricated here.
      return json({ deliveries: await store.ledger.deliveriesFor(tenantId, decisionId) });
    }

    case 'change-sets': {
      await store.governanceReady;
      if (rest[0]) {
        const cr = await store.governance.changeSet(CONSOLE_TENANT, rest[0]);
        return cr ? json(cr) : notFound(`No change set ${rest[0]}`);
      }
      // Newest request first — the store's order, not the fixture file's.
      const status = q.get('status');
      const result = await store.governance.changeSets(
        CONSOLE_TENANT,
        status ? (status as ChangeSetStatus) : undefined
      );
      return json({ changeSets: result, total: result.length });
    }

    case '_test': {
      // GET /api/_test/uptime — how long this process has been accumulating
      // state. Development only, like the rest of the `_test` namespace.
      if (rest[0] !== 'uptime') return notFound();
      if (process.env.NODE_ENV === 'production') return notFound();
      await store.catalogueReady.catch(() => {});
      await store.registryReady.catch(() => {});
      await store.governanceReady.catch(() => {});
      return json({
        startedAt: STARTED_AT,
        uptimeMs: Date.now() - new Date(STARTED_AT).getTime(),
        // The token the e2e harness started this process with, so the suite
        // can refuse a server it did not start. Null for a server a person
        // started, which is exactly the server the suite must not measure.
        // G-035.
        run: process.env.METIS_E2E_RUN ?? null,
        // What this process actually seeded, hashed per part.
        //
        // Computed from the modules *this server* has loaded, which is the
        // whole point: the suite computes the same function over the files on
        // disk, and a difference is proof that a fixture was edited after the
        // server started. Without it a reused server answers from a seed
        // nobody is looking at, and a Rule 9 bite-proof against it proves
        // nothing (G-002).
        //
        // Served only when this process wrote the seed. A catalogue found
        // already stored — a durable database from an earlier start — holds what
        // people authored, not the fixtures, and a fingerprint of the fixtures
        // would claim otherwise. Null makes `global-setup.ts` refuse the server.
        // The same holds for flows: the fingerprint covers the fixture flows,
        // so a registry found already stored voids it too, and so do change
        // sets and an audit log found already stored.
        seed:
          store.catalogueSeeded() && store.registrySeeded() && store.governanceSeeded()
            ? store.seededFingerprint
            : null,
      });
    }

    case 'audit': {
      await store.governanceReady;
      const limit = Number(q.get('limit') || 100);
      return json({
        events: await store.governance.events(CONSOLE_TENANT, { limit }),
        total: await store.governance.countEvents(CONSOLE_TENANT),
      });
    }

    case 'connectors': {
      return json({ connectors: (await readCatalogue()).connectors });
    }

    // GET /api/tenants/{tenantId}/settings — the locale and currency every
    // formatter in the console reads. G-092.
    case 'tenants': {
      if (rest[1] !== 'settings') return notFound();
      if (rest[0] !== store.tenantSettings.tenantId) return notFound(`No tenant ${rest[0]}`);
      return json(store.tenantSettings);
    }

    case 'placements': {
      return json({ placements: (await readCatalogue()).placements });
    }

    case 'data-sources': {
      if (!rest[0]) return notFound();
      return json({ sources: store.dataSources });
    }

    case 'experiments': {
      if (!rest[0]) return notFound();
      return json({ experiments: (await readCatalogue()).experiments });
    }

    // GET /api/profile-schema/{tenantId} — the data model, and the paths a
    // policy may reference.
    //
    // The paths are served rather than derived in the client. The compiler and
    // the editor must agree about which operators a type admits, and the only
    // way to guarantee that is one implementation — an operator the editor
    // does not offer has to be one the compiler rejects.
    // GET /api/performance/{tenantId} — outcomes joined to their decisions.
    //
    // Outcomes had been recorded since the ledger existed and nothing read
    // them, so the platform could say what it decided and never whether it
    // worked.
    //
    // Read over the same corpus `/decisions` lists, not over the ledger alone.
    // The console has two decision stores — the generated corpus it displays,
    // and the ledger that runtime decisions land in — and `POST /outcomes`
    // deliberately accepts either, because a seeded decision is real to this
    // console even though it predates the ledger. A report that covered only
    // the ledger would say "0 decisions" on a console showing five thousand,
    // which is a worse answer than a slow one.
    case 'performance': {
      const tenantId = rest[0];
      if (!tenantId) return notFound();

      const flowId = q.get('flowId');
      const channel = q.get('channel');
      // Defaults to the whole corpus, not to 5,000. The seeded tenant holds
      // 10,400 decisions, so the old default silently reported on the most
      // recent half and called it the tenant's performance — a truncated
      // number that looks like a complete one. An explicit ?limit still caps it.
      const limit = Math.min(Number(q.get('limit') || 20000), 20000);

      // The corpus, in the shape the read model takes. Only the fields it
      // reads are filled: this is a projection for counting, not a second copy
      // of the ledger pretending to be one.
      // Built from the committed decision index rather than from 10,400
      // re-executions. `buildPerformance` reads `winner` and `channel`, and the
      // arm join below reads `customerRef` — all three are columns in the
      // index, so nothing here needs a full trace and nothing pays to make one.
      const fromCorpus = decisions.map((d) => ({
        tenantId,
        decisionId: d.id,
        subjectHash: '',
        occurredAt: d.timestamp,
        flowId: d.artifactId,
        flowVersion: d.artifactVersion,
        chainHash: '',
        record: {
          decision: {
            winner: d.winner,
            channel: d.channel,
            customerRef: d.customerId,
          },
        } as unknown as DecisionRecord,
      }));

      // The corpus rows by id, so the seeded outcome projection can be built
      // for exactly the decisions this report covers rather than for all
      // 10,400 every time a filter narrows it.
      const decisionById = new Map(decisions.map((d) => [d.id, d]));
      const seededIds = new Set(decisionById.keys());

      // Runtime decisions too, deduped by id — a decision made through the API
      // is in the ledger and not in the corpus.
      const seen = new Set(fromCorpus.map((e) => e.decisionId));
      const fromLedger = (await store.ledger.query({ tenantId, limit })).filter(
        (e) => !seen.has(e.decisionId)
      );

      const all = [...fromCorpus, ...fromLedger]
        .filter((e) => (flowId ? e.flowId === flowId : true))
        .filter((e) => (channel ? e.record.decision.channel === channel : true))
        .slice(0, limit);

      // One fetch per decision. Correct and slow, and the right shape to
      // replace with a join when there is a store that can do one — an
      // approximation would have been a number nobody could check.
      // Two sources, and the merge is the point. The seeded corpus carries
      // outcomes as a projection (ADR-008 phase two) because its decisions are
      // not ledger rows; a decision made through the API carries real ones. A
      // decision that has both — a seeded decision somebody then clicked in the
      // console — gets both, because the ledger event is a fact and the seeded
      // one is the history it happened against.
      const outcomes = seededOutcomeMap(
        all
          .filter((e) => seededIds.has(e.decisionId))
          .map((e) => decisionById.get(e.decisionId)!)
      );
      for (const entry of all) {
        const events = await store.ledger.outcomesFor(tenantId, entry.decisionId);
        if (events.length === 0) continue;
        outcomes.set(entry.decisionId, [...(outcomes.get(entry.decisionId) ?? []), ...events]);
      }

      // The channels something actually delivers on — ADR-013. Passed rather
      // than inferred: the ledger has no opinion about placements, and without
      // this the report answers null for `deliverable` rather than zero, which
      // is the difference between "nothing is deliverable" and "nobody said".
      const cat = await readCatalogue();
      const report = buildPerformance(all, outcomes, deliverableChannels(cat.placements));

      // Per-arm counts, recomputed from each decision's customer reference.
      // Nothing stored the arm; it is a function of the reference and the
      // experiment, which is what makes a months-old decision still explainable
      // and what makes this join possible at all.
      const armRows = cat.experiments
        .filter((e) => e.status !== 'draft')
        .flatMap((experiment) =>
          experiment.arms.map((arm) => {
            let offered = 0;
            let measured = 0;
            let acceptances = 0;
            let valueMinor: number | null = null;

            for (const entry of all) {
              if (!entry.record.decision.winner) continue;
              const ref = entry.record.decision.customerRef;
              if (!ref) continue;
              // `assignArm` returns null for a stopped experiment, so the arm
              // is taken from the arms list directly against the same bucket.
              const assigned = assignArm({ ...experiment, status: 'running' }, ref);
              if (assigned?.key !== arm.key) continue;

              offered += 1;
              const events = outcomes.get(entry.decisionId) ?? [];
              if (events.length > 0) measured += 1;
              if (events.some((e) => e.type === 'acceptance')) acceptances += 1;
              for (const e of events) {
                if (e.valueMinor !== null && e.valueMinor !== undefined) {
                  valueMinor = (valueMinor ?? 0) + e.valueMinor;
                }
              }
            }

            return {
              experimentKey: experiment.key,
              arm: arm.key,
              holdout: Boolean(arm.holdout),
              offered,
              measured,
              acceptances,
              // Over observations, never over offers — the same rule the rest
              // of the report follows.
              acceptanceRate: measured === 0 ? null : acceptances / measured,
              valueMinor,
            };
          })
        );

      // Where these numbers came from, in the payload rather than in the
      // interface. A report that joins 416 seeded outcomes to the four a
      // reviewer just produced is not evidence, and a badge in the nav rail
      // does not survive an export or a screenshot.
      return json({
        ...report,
        arms: armRows,
        provenance: provenanceOver(all.map((e) => e.decisionId)),
      });
    }

    // Where candidates fall out of decisions: the trace reader's cascade, summed
    // over every decision in range. Proposed (G-107) — no plane serves it; this
    // development API does, from the same two sources the performance report
    // reads.
    case 'policy-funnel': {
      const tenantId = rest[0];
      if (!tenantId) return notFound();
      const flowId = q.get('flowId');
      const channel = q.get('channel');
      const inScope = (flow: string, ch: string) => (flowId ? flow === flowId : true) && (channel ? ch === channel : true);

      // The seeded corpus from the index's `removals` column, not from 10,400
      // re-executions (5.5 seconds). Decisions made through the API come from
      // the ledger, whose records carry their eliminations whole, deduped by id
      // the way the performance report dedupes them.
      const corpus = corpusFunnelRows().filter((d) => inScope(d.flowId, d.channel));
      const seen = new Set(corpus.map((d) => d.decisionId));
      const live = (await store.ledger.query({ tenantId, limit: 20000 })).filter(
        (e) => !seen.has(e.decisionId) && inScope(e.flowId, e.record.decision.channel)
      );
      const inRange = [...corpus, ...live.map(funnelDecisionOf)];

      // Which questions the flows in range ask, from their compiled nodes. A
      // targeting tier is the one the node's declared policies share. The source
      // node is where a retired or out-of-window candidate is removed, every
      // constraint node enforces frequency whatever its tier, and the arbitrate
      // node is where a candidate loses on priority. Consent is asked of every
      // decision by the platform, whatever the flow's nodes (G-015).
      const asked = new Set<FunnelStageId>();
      for (const id of new Set([...corpus.map((d) => d.flowId), ...live.map((e) => e.flowId)])) {
        asked.add('consent');
        for (const node of findCompilation(id)?.result.artifact?.nodes ?? []) {
          if (node.tier === 'eligibility' || node.tier === 'relevance' || node.tier === 'suitability') asked.add(node.tier);
          if (node.type === 'source') asked.add('not_live');
          if (node.type === 'constraint') asked.add('frequency');
          if (node.type === 'arbitrate') asked.add('not_ranked');
        }
      }

      return json({
        ...buildPolicyFunnel(inRange, asked),
        provenance: provenanceOver(inRange.map((d) => d.decisionId)),
      });
    }

    // What the engines are held to, and by which check. Proposed (G-109).
    //
    // Counted from the committed corpus files, so a figure here is the file's
    // own and cannot drift from it. Whether the engines agree is not reported:
    // that is what the named checks assert where they run, and this server can
    // run neither, so it says what is checked and by what — never that it passed.
    case 'conformance': {
      const dir = nodePath.resolve(process.cwd(), '..', '..', 'docs', 'conformance');
      const casesIn = (file: string): number | null => {
        try {
          const parsed = JSON.parse(readFileSync(nodePath.join(dir, file), 'utf8')) as { cases?: unknown };
          return Array.isArray(parsed.cases) ? parsed.cases.length : null;
        } catch {
          return null;
        }
      };
      const corpora = [
        {
          id: 'values',
          file: 'docs/conformance/canonical-corpus.json',
          // Rendered on the Overview, so the reason in words and no ADR number (tests/ticket-ids.ts).
          covers: 'How a value serialises and hashes',
          cases: casesIn('canonical-corpus.json'),
        },
        {
          id: 'decisions',
          file: 'docs/conformance/decision-corpus.json',
          covers: 'What a decision is: its winner, what each node removed, and its chain hash',
          cases: casesIn('decision-corpus.json'),
        },
        {
          id: 'service',
          file: 'docs/conformance/service-cases.json',
          covers: 'Real decisions sent through the HTTP service, compared by chain hash',
          cases: casesIn('service-cases.json'),
        },
      ];
      // A corpus this server cannot read is not reported as empty.
      if (corpora.some((c) => c.cases === null)) return notFound();
      return json({
        corpora,
        engines: [
          { engine: 'typescript', checkedBy: 'The conformance corpus matches the reference', runsIn: 'gates' },
          { engine: 'kotlin', checkedBy: 'kotlin-conformance', runsIn: 'ci' },
        ],
      });
    }

    case 'profile-schema': {
      if (!rest[0]) return notFound();
      const cat = await readCatalogue();
      const schema = schemaOf(cat);
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
        // Experiment arms are selectable fields too. A holdout is an
        // eligibility rule that refuses when the arm is the untreated one, and
        // it should be written in the same editor as every other rule rather
        // than in a parallel experiment-only concept.
        experimentPaths: cat.experiments
          .filter((e) => e.status !== 'draft')
          .map((e) => ({
            path: armPath(e.key),
            kind: 'field' as const,
            type: 'enum' as const,
            operators: operatorsFor('enum'),
            description: `Arm of '${e.name}'. Assigned from the customer reference; recomputable, never stored.`,
            entity: 'Experiment',
            members: e.arms.map((a) => a.key),
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
        const mine =
          env?.activeVersion && env.shadowVersion
            ? (
                await store.registry.shadowComparisons<ShadowComparison>(tenantId, rest[1], {
                  environment: 'production',
                  activeVersion: env.activeVersion,
                  shadowVersion: env.shadowVersion,
                })
              ).map((r) => r.comparison)
            : [];
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
      // The verdict is compiled from the stored draft against the stored
      // catalogue on every read. It was a table compiled once at import from
      // the fixture flows and the fixture catalogue, so a saved draft or an
      // edited offer never moved what the flow list said.
      if (rest[1]) {
        const artifact = await flowDraft(rest[1]);
        if (!artifact) return notFound(`No flow ${rest[1]}`);
        // The compiler's verdict travels with the flow: a console that
        // hides it is no better than not compiling at all.
        const compilation = compileDecisionFlow(toSource(artifact), await currentCompileContext(artifact.id));
        return json({ ...artifact, compilation });
      }
      const sources = compileSourcesFrom(await readCatalogue());
      return json({
        artifacts: (await flowDrafts()).map((a) => {
          const result = compileDecisionFlow(toSource(a), compileContextFor(a.id, sources));
          return {
            ...a,
            compileOk: result.ok,
            errorCount: result.diagnostics.filter((x) => x.severity === 'error').length,
            warningCount: result.diagnostics.filter((x) => x.severity === 'warning').length,
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
  // The ledger's store is chosen asynchronously, because reaching a database
  // is. Awaited once per request rather than at import: a configured database
  // that cannot be reached must fail the request that needed it rather than
  // stop the process from starting, and it must never fall through to storage
  // that forgets. Resolves immediately when no database is configured.
  await store.ledgerReady;

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

      // A seeded decision is real to this console even though it predates the
      // ledger — `GET /outcomes` has always said so. The POST did not, so the
      // five thousand decisions the console displays could be read for
      // outcomes and never given one, and the measurement loop could not be
      // exercised against any of them.
      //
      // Materialised on first outcome rather than seeded at startup: the
      // ledger's invariant is that an outcome always joins to a decision, and
      // writing the decision first keeps that true without paying for five
      // thousand inserts nobody may ever measure.
      if (!(await store.ledger.get(tenantId, decisionId))) {
        const seeded = findGeneratedDecision(decisionId);
        if (seeded) {
          await store.ledger.record(store.ledger.entryFor(seeded.trace, tenantId));
        }
      }

      try {
        await store.ledger.recordOutcome(event);
      } catch (e) {
        return json({ error: 'not_found', message: (e as Error).message }, 404);
      }
      return json(event, 201);
    }

    case 'objectives': {
      // POST /api/objectives/{tenantId} — create an objective.
      //
      // The top of the taxonomy, and the marketer's first click. Until this
      // existed it was the only step of their journey that needed a redeploy:
      // `getTaxonomy` could read the taxonomy since the spec was written, and
      // nothing could write it.
      //
      // The rules here are `Catalogue.putObjective`'s, which the memory and
      // PostgreSQL stores both already answer to
      // (`packages/catalogue/tests/suite.ts`). This handler is the console's
      // own copy of them, in the same shape `createOffer` above uses — the
      // duplication is real and is registered as G-038.
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');

      const body = (await req.json().catch(() => null)) as Partial<Objective> | null;
      if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);

      const missing = (['key', 'name'] as const).filter((f) => blankString(body[f]));
      if (missing.length) {
        return json(
          { error: 'bad_request', message: `Missing required field(s): ${missing.join(', ')}` },
          400
        );
      }

      // The key is what a category and every offer beneath it is filed under,
      // and it is stable for the life of the objective, so two sharing one
      // would make the taxonomy ambiguous exactly where a flow reads it.
      const cat = await readCatalogue();
      if (cat.objectives.some((o) => o.key === body.key)) {
        return json(
          { error: 'conflict', message: `An objective already uses the key '${body.key}'.` },
          409
        );
      }

      const now = new Date().toISOString();
      const objective: Objective = {
        description: '',
        // Appended to the end of the taxonomy unless the author said where.
        // Zero would silently jump a new objective to the top of every list.
        sortOrder: cat.objectives.length + 1,
        ...body,
        // `iss_` predates the 2026-09-05 rename and is kept because an id is
        // stable and appears in authored records; the offers handler keeps
        // `prop_` for the same reason.
        id: `iss_${body.key}`,
        key: body.key as string,
        name: body.name as string,
        createdAt: now,
        updatedAt: now,
      } as Objective;

      await store.catalogue.putObjective(CONSOLE_TENANT, objective, user.email, now);
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'ObjectiveCreated',
        scope: objective.id,
        summary: `Created objective ${objective.name} (${objective.key}).`,
      });
      return json(objective, 201);
    }

    case 'categories': {
      // POST /api/categories/{tenantId} — create a category under an objective.
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');

      const body = (await req.json().catch(() => null)) as Partial<Category> | null;
      if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);

      const missing = (['key', 'name', 'objectiveId'] as const).filter((f) => blankString(body[f]));
      if (missing.length) {
        return json(
          { error: 'bad_request', message: `Missing required field(s): ${missing.join(', ')}` },
          400
        );
      }

      // `Catalogue.putCategory`'s UNKNOWN_OBJECTIVE, served: a category outside
      // the taxonomy cannot be reached by a decision flow, so accepting it
      // would create something that looks authored and can never be chosen.
      const cat = await readCatalogue();
      if (!cat.objectives.some((o) => o.id === body.objectiveId)) {
        return json(
          {
            error: 'bad_request',
            message: `No objective '${body.objectiveId}'. A category outside the taxonomy cannot be reached by a decision flow.`,
          },
          400
        );
      }
      if (cat.categories.some((c) => c.key === body.key)) {
        return json(
          { error: 'conflict', message: `A category already uses the key '${body.key}'.` },
          409
        );
      }

      const now = new Date().toISOString();
      const siblings = cat.categories.filter((c) => c.objectiveId === body.objectiveId);
      const category: Category = {
        description: '',
        sortOrder: siblings.length + 1,
        ...body,
        // `grp_` predates the rename, as `iss_` above does.
        id: `grp_${body.key}`,
        key: body.key as string,
        name: body.name as string,
        objectiveId: body.objectiveId as string,
        createdAt: now,
        updatedAt: now,
      } as Category;

      await store.catalogue.putCategory(CONSOLE_TENANT, category, user.email, now);
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'CategoryCreated',
        scope: category.id,
        summary: `Created category ${category.name} (${category.key}) under ${body.objectiveId}.`,
      });
      return json(category, 201);
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
      const cat = await readCatalogue();
      if (cat.offers.some((p) => p.key === body.key)) {
        return json(
          { error: 'conflict', message: `An offer already uses the key '${body.key}'.` },
          409
        );
      }
      if (!cat.categories.some((c) => c.id === body.categoryId)) {
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

      // Defaults first, then the body, then the fields the server owns
      // outright. Spreading the body rather than copying it field by field is
      // what makes a new property in the spec reach the store without a change
      // here — the same shape `updateOffer` below already had, and the reason
      // adding a field to an offer is a descriptor edit and nothing else.
      const defaults = {
        description: '',
        // Draft unless the caller says otherwise. An offer that went live the
        // moment it was created would skip every review the platform has.
        status: 'draft' as const,
        // The tenant's own currency, from what it already sells. Hardcoded to
        // GBP until 2026-09-12, so an offer created in a US tenant was written
        // with sterling financials and every screen rendered it that way.
        financials: {
          price: { amount: 0, currency: tenantCurrency() },
          cost: { amount: 0, currency: tenantCurrency() },
          expectedMargin: { amount: 0, currency: tenantCurrency() },
          termMonths: 0,
          oneOff: false,
        },
        validity: { startsAt: now.slice(0, 10), endsAt: null },
        boost: 1,
        policyIds: [] as string[],
        creativeIds: [] as string[],
        tags: [] as string[],
      };

      const offer: Offer = {
        ...defaults,
        ...body,
        // Content-addressed ids are for decisions; a catalogue entity is named
        // by its key, which is the thing that has to stay stable.
        id: `prop_${body.key}`,
        key: body.key as string,
        name: body.name as string,
        categoryId: body.categoryId as string,
        objectiveId: body.objectiveId as string,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.email,
      } as Offer;

      await store.catalogue.putOffer(CONSOLE_TENANT, offer, user.email, now);
      await recordAudit({
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
      const cat = await readCatalogue();
      const offer = cat.offers.find((p) => p.id === offerId);
      if (!offer) return notFound(`No offer ${offerId}`);

      const body = (await req.json().catch(() => null)) as Partial<Creative> | null;
      if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);
      if (!body.channel) {
        return json({ error: 'bad_request', message: 'Missing required field: channel' }, 400);
      }
      if (blankString(body.name)) {
        return json({ error: 'bad_request', message: 'Missing required field: name' }, 400);
      }

      const rejected = creativeProblems(body.channel, body.content as Creative['content'], cat.placements);
      if (rejected) return rejected;

      const id = body.id ?? `trt_${offer.key}_${body.channel}`;
      if (cat.creatives.some((c) => c.id === id)) {
        return json({ error: 'conflict', message: `A creative already uses the id '${id}'.` }, 409);
      }

      const now = new Date().toISOString();

      // Defaults, then the body, then what the server owns — the same shape as
      // `createOffer` above, and for the same reason: a property added to the
      // spec reaches the store without a change here, which is what makes
      // adding a field to a creative a descriptor edit and nothing else.
      const creative: Creative = {
        active: false,
        // Whatever this tenant's content is already written in, rather than
        // en-GB for a tenant whose every other creative is en-US.
        locale: tenantLocale(),
        ...body,
        id,
        offerId: offer.id,
        name: body.name as string,
        channel: body.channel,
        content: body.content as Creative['content'],
        createdAt: now,
        updatedAt: now,
      } as Creative;

      await store.catalogue.putCreative(CONSOLE_TENANT, creative, user.email, now);
      // `Creative.offerId` is the foreign key — `packages/catalogue` treats it
      // as such and refuses a creative whose offer does not exist. `creativeIds`
      // is a denormalisation the offers list reads for its channel-coverage
      // column, so it is maintained here rather than left to drift.
      if (!offer.creativeIds.includes(creative.id)) {
        await store.catalogue.putOffer(
          CONSOLE_TENANT,
          { ...offer, creativeIds: [...offer.creativeIds, creative.id] },
          user.email,
          now
        );
      }

      await recordAudit({
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

        const artifact = await artifactFor(body.request.tenantId, body.artifactId);
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
      const seeded = findGeneratedDecision(rest[0]);
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
        const entry = await store.ledger.get('telco-us', rest[0]);
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

    case 'data-sources': {
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('edit:integrations')) return forbidden('edit:integrations');

      const [tenantId, sourceId, action] = rest;
      if (!tenantId) return notFound();

      // POST /api/data-sources/{tenantId} - define a source.
      if (!sourceId) {
        const body = (await req.json().catch(() => null)) as {
          name?: string;
          description?: string;
          kind?: DataSourceDefinition['kind'];
        } | null;
        if (!body?.name || !body.kind) {
          return json({ error: 'bad_request', message: 'name and kind are required.' }, 400);
        }

        const source: DataSourceDefinition = {
          id: `src_${Math.random().toString(36).slice(2, 10)}`,
          tenantId,
          name: body.name,
          description: body.description ?? '',
          kind: body.kind,
          columns: [],
          mappings: [],
          status: 'draft',
          landedRows: 0,
          updatedAt: new Date().toISOString(),
          updatedBy: user.email,
        };
        store.dataSources.push(source);
        await recordAudit({
          actor: user.email,
          actorType: 'human',
          eventType: 'DataSourceCreated',
          scope: source.id,
          summary: `Defined ${body.kind} source '${body.name}'.`,
        });
        return json(source, 201);
      }

      const source = store.dataSources.find((d) => d.id === sourceId);
      if (!source) return notFound(`No source ${sourceId}`);

      // POST .../rows - land records as they arrived.
      if (action === 'rows') {
        const body = (await req.json().catch(() => null)) as {
          rows?: Record<string, unknown>[];
          replace?: boolean;
        } | null;
        if (!Array.isArray(body?.rows)) {
          return json({ error: 'bad_request', message: 'rows must be an array.' }, 400);
        }

        const existing = body.replace ? [] : (store.landedRows.get(sourceId) ?? []);
        const rows = [...existing, ...body.rows].slice(0, MAX_LANDED_ROWS);
        store.landedRows.set(sourceId, rows);

        // Observed, never interpreted. Which column means what is the mapping's
        // job, and keeping the two apart is why a source changing shape shows
        // up as an unmapped column rather than as silently absent data.
        source.columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
        source.landedRows = rows.length;
        // Rows that arrived after a validation were not the rows that were
        // validated, so the verdict no longer describes what is held.
        source.status = 'draft';
        store.validationReports.delete(sourceId);
        source.updatedAt = new Date().toISOString();
        source.updatedBy = user.email;

        await recordAudit({
          actor: user.email,
          actorType: 'human',
          eventType: 'RowsLanded',
          scope: source.id,
          summary: `Landed ${body.rows.length} row(s) against '${source.name}'; ${rows.length} held.`,
        });
        return json(source);
      }

      // POST .../validation - check what is held against the model.
      if (action === 'validation') {
        const rows = store.landedRows.get(sourceId) ?? [];
        const report = validateRows(schemaOf(await readCatalogue()), source, rows);
        store.validationReports.set(sourceId, report);
        source.status = report.errors === 0 && report.rows > 0 ? 'validated' : 'draft';
        source.updatedAt = new Date().toISOString();
        return json({ source, report });
      }

      // POST .../activation - refuse unless the last validation was clean.
      if (action === 'activation') {
        const problems = activationProblems(source, store.validationReports.get(sourceId) ?? null);
        if (problems.length > 0) {
          return json(
            {
              error: 'not_activatable',
              message: `This source cannot go live yet: ${problems.length} problem(s).`,
              problems,
            },
            409
          );
        }
        source.status = 'active';
        source.updatedAt = new Date().toISOString();
        source.updatedBy = user.email;
        await recordAudit({
          actor: user.email,
          actorType: 'human',
          eventType: 'DataSourceActivated',
          scope: source.id,
          summary: `Activated '${source.name}' over ${source.landedRows} row(s).`,
        });
        return json(source);
      }

      return notFound();
    }
    case 'experiments': {
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('edit:flows')) return forbidden('edit:flows');
      if (!rest[0]) return notFound();

      const body = (await req.json().catch(() => null)) as Partial<Experiment> | null;
      if (!body?.key || !body.name) {
        return json({ error: 'bad_request', message: 'key and name are required.' }, 400);
      }
      if ((await readCatalogue()).experiments.some((e) => e.key === body.key)) {
        return json(
          {
            error: 'conflict',
            message: `An experiment already uses the key '${body.key}', and two would collide at ${armPath(body.key)}.`,
          },
          409
        );
      }

      const now = new Date().toISOString();
      const experiment: Experiment = {
        id: `exp_${Math.random().toString(36).slice(2, 10)}`,
        tenantId: rest[0],
        key: body.key,
        name: body.name,
        description: body.description ?? '',
        arms: body.arms ?? [],
        // Always a draft. Created running would start splitting live traffic
        // before anybody approved the split.
        status: 'draft',
        startedAt: null,
        stoppedAt: null,
        updatedAt: now,
        updatedBy: user.email,
      };

      const problems = experimentProblems(experiment);
      if (problems.length > 0) {
        return json(
          { error: 'invalid_experiment', message: `${problems.length} problem(s).`, problems },
          400
        );
      }

      await store.catalogue.putExperiment(CONSOLE_TENANT, experiment, user.email, now);
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'ExperimentCreated',
        scope: experiment.id,
        summary: `Drafted '${experiment.name}' with ${experiment.arms.length} arms.`,
      });
      return json(experiment, 201);
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

      const refused = policyProblems(body.conditions ?? [], schemaOf(await readCatalogue()));
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
      await store.catalogue.putTargetingPolicy(CONSOLE_TENANT, policy, user.email, now);

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'TargetingPolicyCreated',
        scope: policy.id,
        summary: `Created ${policy.kind} policy '${policy.name}' with ${policy.conditions.length} condition(s).`,
      });

      return json(policy, 201);
    }

    case 'placements': {
      // POST /api/placements/{tenantId} — configure a slot.
      //
      // Two operations share this head and the path length separates them:
      // `/placements/{tenantId}` creates, `/placements/{tenantId}/{key}/decisions`
      // decides. Distinguished on the segment count rather than on a body field,
      // so a malformed create cannot be read as a decision.
      if (rest.length === 1) {
        const user = actor(req);
        if (!user) return json({ error: 'no_session' }, 401);
        if (!user.permissions.includes('edit:integrations')) return forbidden('edit:integrations');

        const body = (await req.json().catch(() => null)) as Partial<Placement> | null;
        if (!body) return json({ error: 'bad_request', message: 'Request body must be JSON' }, 400);

        const missing = (['key', 'name', 'channel', 'artifactId'] as const).filter((f) =>
          blankString(body[f])
        );
        if (missing.length) {
          return json(
            { error: 'bad_request', message: `Missing required field(s): ${missing.join(', ')}` },
            400
          );
        }
        if ((await readCatalogue()).placements.some((p) => p.key === body.key)) {
          return json(
            { error: 'conflict', message: `A placement already uses the key '${body.key}'.` },
            409
          );
        }
        // A slot answered by a flow that does not exist decides nothing, and
        // the 404 would surface at the first request rather than here.
        if (!(await flowDraft(body.artifactId!))) {
          return json(
            { error: 'bad_request', message: `No decision flow '${body.artifactId}'.` },
            400
          );
        }

        const now = new Date().toISOString();
        const placement: Placement = {
          description: '',
          slotCount: 1,
          // Decidable by default; delivered by nothing. The honest starting
          // state for a new slot, and the one four of this tenant's five
          // channels are in.
          decidable: true,
          ...body,
          // Delivered by nothing unless somebody says otherwise. The honest
          // starting state for a new slot, and the one four of this tenant's
          // five channels are in.
          delivery: normaliseDelivery(body.delivery) ?? null,
          id: `plc_${body.key}`,
          key: body.key as string,
          name: body.name as string,
          channel: body.channel as Placement['channel'],
          artifactId: body.artifactId as string,
          updatedAt: now,
          updatedBy: user.email,
        } as Placement;

        await store.catalogue.putPlacement(CONSOLE_TENANT, placement, user.email, now);
        await recordAudit({
          actor: user.email,
          actorType: 'human',
          eventType: 'PlacementCreated',
          scope: placement.id,
          summary: `Created placement ${placement.name} (${placement.key}) on ${placement.channel}.`,
        });
        return json(placement, 201);
      }

      // POST /api/placements/{tenantId}/{placementKey}/decisions — fill a slot.
      //
      // The same decision `POST /decisions` makes, delivered as a slate. The
      // caller names a placement rather than a flow, because which flow answers
      // for a slot is configuration and a website should not be holding it.
      const [tenantId, placementKey, tail] = rest;
      if (!tenantId || !placementKey || tail !== 'decisions') return notFound();

      const cat = await readCatalogue();
      const placement = cat.placements.find(
        // `decidable`, not `delivery`: whether a decision may be made is a
        // different question from whether anything sends the result, and this
        // endpoint answers the first. A slot with no deliverer still decides —
        // and now records a suppressed delivery attempt saying so.
        (p) => p.key === placementKey && p.decidable
      );
      if (!placement) {
        return notFound(
          `No active placement '${placementKey}'. Configured: ${cat.placements
            .filter((p) => p.decidable)
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

      const artifact = await artifactFor(tenantId, placement.artifactId);
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

      const outcome = await decideAndRecord(artifact, decisionRequest, cat);
      if (outcome.kind === 'error') return outcome.response;

      const record = outcome.kind === 'replay' ? outcome.record : outcome.trace;
      const slate = selectSlate(record.decision, placement.slotCount);

      // What the platform did about getting this decision to somebody —
      // ADR-013 §1. Written here because this is the moment the platform hands
      // the decision over, or discovers it has nobody to hand it to.
      //
      // Not on a replay: an idempotent retry returns the original decision and
      // did not deliver anything a second time.
      if (outcome.kind !== 'replay') {
        await recordDeliveryFor(placement, record.id, decisionRequest.tenantId);
      }

      // The action key is what the decision names; the offer id is what a site
      // needs to fetch content. Resolved from the catalogue the engine read, so
      // the two cannot name different things.
      const offerByKey = new Map(cat.offers.map((o) => [o.key, o.id]));

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

      await store.governanceReady;
      const alreadyDecided = (status: string) =>
        json({ error: 'already_decided', message: `This change set was already ${status}.` }, 409);

      const current = await store.governance.changeSet(CONSOLE_TENANT, rest[0]);
      if (!current) return notFound(`No change set ${rest[0]}`);
      if (current.status !== 'pending') return alreadyDecided(current.status);

      const approving = rest[1] === 'approve';
      if (!approving && rest[1] !== 'reject') return notFound();

      const body = (await req.json().catch(() => ({}))) as { reason?: string };

      // Decided in the store before the diff is applied. The store writes a
      // decision only over a pending change set, so of two approvals made
      // together exactly one gets past here and a diff is applied at most once.
      // The price is the opposite failure: an apply that throws after this line
      // leaves a change set approved whose diff did not land (G-117's shape).
      let cr: ChangeSet;
      try {
        cr = await store.governance.decide(CONSOLE_TENANT, current.id, {
          status: approving ? 'approved' : 'rejected',
          decidedBy: user.email,
          decidedAt: new Date().toISOString(),
          reason: body.reason ?? (approving ? 'Approved from the console.' : 'Rejected from the console.'),
        });
      } catch (e) {
        if (e instanceof GovernanceError && e.code === 'ALREADY_DECIDED') {
          const now = await store.governance.changeSet(CONSOLE_TENANT, current.id);
          return alreadyDecided(now?.status ?? 'decided');
        }
        throw e;
      }

      // An approved change actually applies its diff to the store.
      if (approving) await applyChangeSet(cr, user.email);

      await recordAudit({
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

          await recordAudit({
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

          await recordAudit({
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
        // The flow being published, so its candidates are judged against the
        // channels its own slots deliver on rather than the tenant's.
        await currentCompileContext(flowName)
      );

      if (outcome.status !== 'rejected') {
        await recordAudit({
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
      // Awaited. It used to return before the registry had re-seeded and
      // before the ledger had resolved, so a test that reset and immediately
      // read got a half-built store and blamed its own assertion.
      try {
        await resetStore();
      } catch (e) {
        if (e instanceof ResetRefused) return json({ error: 'reset_refused', message: e.message }, 409);
        throw e;
      }
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
async function applyChangeSet(cr: ChangeSet, actor: string) {
  // Read, change a copy, write back. This used to assign into the store's own
  // objects, which a real store does not hand out: the edit would have landed
  // on a copy and the approved change would have changed nothing.
  const cat = await readCatalogue();
  const at = new Date().toISOString();
  switch (cr.changeType) {
    case 'arbitration_weights': {
      const current = snapshotFrom(cat).arbitration;
      const weights = { ...current.weights };
      for (const d of cr.diff) {
        const key = d.field.replace(/^weights\./, '') as keyof ArbitrationConfig['weights'];
        if (key in weights) weights[key] = Number(d.after);
      }
      await store.catalogue.putArbitration(
        CONSOLE_TENANT,
        { ...current, weights, formula: formulaOf(weights) },
        actor,
        at
      );
      break;
    }
    case 'boost_adjust': {
      for (const d of cr.diff) {
        const boost = cat.boosts.find((l) => l.id === d.field.split('.')[0]);
        if (boost) {
          await store.catalogue.putBoost(CONSOLE_TENANT, { ...boost, value: Number(d.after) }, actor, at);
        }
      }
      break;
    }
    case 'policy_edit': {
      // Every diff line applied to one copy per policy, then one write per policy.
      const edited = new Map<string, TargetingPolicy>();
      const policy = (id: string) => {
        if (!edited.has(id)) {
          const found = cat.targetingPolicies.find((p) => p.id === id);
          if (found) edited.set(id, structuredClone(found));
        }
        return edited.get(id);
      };
      for (const d of cr.diff) {
        // e.g. "pol_heavy_user.conditions[0].value"
        const match = d.field.match(/^(\w+)\.conditions\[(\d+)\]\.value$/);
        if (match) {
          const cond = policy(match[1])?.conditions[Number(match[2])];
          if (cond) cond.value = Number(d.after);
          continue;
        }
        const activeMatch = d.field.match(/^(\w+)\.active$/);
        if (activeMatch) {
          const found = policy(activeMatch[1]);
          if (found) found.active = d.after === 'true';
        }
      }
      for (const p of edited.values()) {
        await store.catalogue.putTargetingPolicy(CONSOLE_TENANT, p, actor, at);
      }
      break;
    }
    case 'offer_retire': {
      const offer = cat.offers.find((p) => p.id === cr.targetScope.targetId);
      if (offer) {
        await store.catalogue.putOffer(CONSOLE_TENANT, { ...offer, status: 'retired' }, actor, at);
      }
      break;
    }
    default:
      break;
  }
}

/** The formula the ranking screen shows, from the weights. */
function formulaOf(w: ArbitrationConfig['weights']): string {
  return `Priority = P^${w.propensity.toFixed(2)} × V^${w.value.toFixed(2)} × B^${w.boost.toFixed(2)} × C^${w.context.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

async function handlePut(req: Request, { params }: Ctx) {
  const { path } = await params;
  const [head, ...rest] = path;
  // The ledger's store is chosen asynchronously, because reaching a database
  // is. Awaited once per request rather than at import: a configured database
  // that cannot be reached must fail the request that needed it rather than
  // stop the process from starting, and it must never fall through to storage
  // that forgets. Resolves immediately when no database is configured.
  await store.ledgerReady;
  const user = actor(req);
  if (!user) return json({ error: 'no_session' }, 401);

  switch (head) {
    case 'data-sources': {
      if (!user.permissions.includes('edit:integrations')) return forbidden('edit:integrations');
      const [, sourceId] = rest;
      const source = store.dataSources.find((d) => d.id === sourceId);
      if (!source) return notFound(`No source ${sourceId}`);

      const body = (await req.json().catch(() => null)) as {
        name?: string;
        description?: string;
        mappings?: FieldMapping[];
      } | null;
      if (!body) return json({ error: 'bad_request', message: 'Body required.' }, 400);

      source.name = body.name ?? source.name;
      source.description = body.description ?? source.description;
      if (body.mappings) {
        source.mappings = body.mappings;
        // A changed mapping means the last verdict was about a different
        // mapping. Keeping the status would let an edit slip past the check it
        // was supposed to pass.
        source.status = 'draft';
        store.validationReports.delete(source.id);
      }
      source.updatedAt = new Date().toISOString();
      source.updatedBy = user.email;

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'DataSourceChanged',
        scope: source.id,
        summary: `Updated source '${source.name}' with ${source.mappings.length} mapping(s).`,
      });
      return json(source);
    }

    case 'artifacts': {
      // PUT /api/artifacts/{tenantId}/{artifactId}/draft
      if (!user.permissions.includes('edit:flows')) return forbidden('edit:flows');
      const [, artifactId, tail] = rest;
      if (!artifactId || tail !== 'draft') return notFound();

      const before = await flowDraft(artifactId);
      if (!before) return notFound(`No flow ${artifactId}`);

      const body = (await req.json().catch(() => null)) as {
        nodes?: ArtifactSummary['nodes'];
        edges?: ArtifactSummary['edges'];
        candidateKeys?: string[];
      } | null;
      if (!body) return json({ error: 'bad_request', message: 'Body required.' }, 400);

      // Built and saved whole, not assigned into the draft that was read: a
      // registry hands back a copy, and an edit to a copy saves nothing.
      const nodes = body.nodes ?? before.nodes;
      const artifact: ArtifactSummary = {
        ...before,
        nodes,
        edges: body.edges ?? before.edges,
        candidateKeys: body.candidateKeys ?? before.candidateKeys,
        nodeCount: nodes.length,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      };
      await store.registry.saveDraft(CONSOLE_TENANT, artifactId, artifact, user.email, artifact.updatedAt);

      // Compiled on every save, not on demand. A graph that will not compile is
      // worth knowing about while it is being drawn, and the report is the same
      // one publish will use — so nobody discovers at publish time that the
      // thing they have been editing was never going to ship.
      const compile = compileDecisionFlow(toSource(artifact), await currentCompileContext(artifact.id));

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'DecisionFlowDraftSaved',
        scope: artifact.id,
        summary:
          `Saved '${artifact.name}' with ${artifact.nodes.length} node(s); ` +
          `${compile.diagnostics.filter((d) => d.severity === 'error').length} error(s).`,
      });

      return json({ artifact, compile });
    }

    case 'experiments': {
      if (!user.permissions.includes('edit:flows')) return forbidden('edit:flows');
      const [, experimentId] = rest;
      const experiment = (await readCatalogue()).experiments.find((e) => e.id === experimentId);
      if (!experiment) return notFound(`No experiment ${experimentId}`);

      const body = (await req.json().catch(() => null)) as Partial<Experiment> | null;
      if (!body) return json({ error: 'bad_request', message: 'Body required.' }, 400);

      // Frozen once it starts. The refusal carries the reason because "you
      // cannot edit this" without it invites somebody to work around it.
      const refused = editProblems(experiment, body);
      if (refused.length > 0) {
        return json(
          { error: 'experiment_frozen', message: refused[0], problems: refused },
          409
        );
      }

      const next: Experiment = {
        ...experiment,
        name: body.name ?? experiment.name,
        description: body.description ?? experiment.description,
        arms: body.arms ?? experiment.arms,
        key: body.key ?? experiment.key,
        status: body.status ?? experiment.status,
      };

      const problems = experimentProblems(next);
      if (problems.length > 0) {
        return json(
          { error: 'invalid_experiment', message: `${problems.length} problem(s).`, problems },
          400
        );
      }

      const now = new Date().toISOString();
      if (next.status === 'running' && experiment.status !== 'running') next.startedAt = now;
      if (next.status === 'stopped' && experiment.status !== 'stopped') next.stoppedAt = now;
      next.updatedAt = now;
      next.updatedBy = user.email;

      await store.catalogue.putExperiment(CONSOLE_TENANT, next, user.email, now);
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        // Compared against the stored experiment. The in-place `Object.assign`
        // this replaced ran before the comparison, so it was always false and a
        // status change was never logged as one.
        eventType:
          next.status !== experiment.status ? 'ExperimentStatusChanged' : 'ExperimentChanged',
        scope: next.id,
        summary: `'${next.name}' is now ${next.status}.`,
      });
      return json(next);
    }

    case 'targeting-policies': {
      // PUT /api/targeting-policies/{tenantId}/{policyId}
      if (!user.permissions.includes('edit:policies')) return forbidden('edit:policies');
      const [, policyId] = rest;
      if (!policyId) return notFound();

      const cat = await readCatalogue();
      const existing = cat.targetingPolicies.find((p) => p.id === policyId);
      if (!existing) return notFound(`No policy ${policyId}`);

      const body = (await req.json().catch(() => null)) as Partial<TargetingPolicy> | null;
      if (!body) return json({ error: 'bad_request', message: 'Body required.' }, 400);

      const conditions = body.conditions ?? existing.conditions;
      const refused = policyProblems(conditions, schemaOf(cat));
      if (refused) return refused;

      // Built and written, not mutated in place. The comment this replaces
      // justified editing the stored object directly; a real store hands out
      // copies, and an edit to a copy goes nowhere.
      const updated: TargetingPolicy = {
        ...existing,
        name: body.name ?? existing.name,
        kind: body.kind ?? existing.kind,
        description: body.description ?? existing.description,
        conditions,
        scope: body.scope ?? existing.scope,
        active: typeof body.active === 'boolean' ? body.active : existing.active,
        updatedAt: new Date().toISOString(),
      };
      await store.catalogue.putTargetingPolicy(CONSOLE_TENANT, updated, user.email, updated.updatedAt);

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'TargetingPolicyChanged',
        scope: updated.id,
        summary: `Updated ${updated.kind} policy '${updated.name}'.`,
      });

      return json(updated);
    }

    case 'arbitration': {
      if (!user.permissions.includes('edit:arbitration')) return forbidden('edit:arbitration');
      const body = (await req.json().catch(() => ({}))) as Partial<ArbitrationConfig>;
      const current = snapshotFrom(await readCatalogue()).arbitration;
      const weights = body.weights ? { ...current.weights, ...body.weights } : current.weights;
      const updated: ArbitrationConfig = {
        ...current,
        weights,
        formula: formulaOf(weights),
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      };
      await store.catalogue.putArbitration(CONSOLE_TENANT, updated, user.email, updated.updatedAt);

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'ArbitrationWeightsChanged',
        scope: 'tenant',
        summary: `Arbitration weights set to ${updated.formula}`,
      });
      return json(updated);
    }

    case 'connectors': {
      // Integrations decide what a decision can see, so editing one is a
      // governed action, not a preference.
      if (!user.permissions.includes('edit:integrations')) return forbidden('edit:integrations');
      const body = (await req.json().catch(() => ({}))) as Partial<Connector>;
      const existing = (await readCatalogue()).connectors.find((c) => c.id === rest[1]);
      if (!existing) return notFound(`No connector ${rest[1]}`);

      const before = { active: existing.active, cacheTtlSeconds: existing.cacheTtlSeconds };
      const connector: Connector = {
        ...existing,
        active: typeof body.active === 'boolean' ? body.active : existing.active,
        cacheTtlSeconds:
          typeof body.cacheTtlSeconds === 'number' ? body.cacheTtlSeconds : existing.cacheTtlSeconds,
        onFailure: typeof body.onFailure === 'string' ? body.onFailure : existing.onFailure,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      };
      await store.catalogue.putConnector(CONSOLE_TENANT, connector, user.email, connector.updatedAt);

      await recordAudit({
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

      await recordAudit({
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

      const cat = await readCatalogue();
      const offer = cat.offers.find((p) => p.id === offerId);
      if (!offer) return notFound(`No offer ${offerId}`);
      const before = cat.creatives.find((c) => c.id === creativeId && c.offerId === offerId);
      if (!before) return notFound(`No creative ${creativeId} on offer ${offerId}`);
      const body = (await req.json().catch(() => ({}))) as Partial<Creative>;
      const updated: Creative = {
        ...before,
        ...body,
        id: before.id,
        offerId: before.offerId,
        updatedAt: new Date().toISOString(),
      };

      const rejected = creativeProblems(updated.channel, updated.content, cat.placements);
      if (rejected) return rejected;

      // Switching off the last active creative of an active offer would leave
      // the offer winning decisions with nothing to render. Refused rather than
      // cascaded: retiring somebody's offer because they edited a creative is
      // not a decision this endpoint gets to make.
      if (before.active && !updated.active && offer.status === 'active') {
        const remaining = cat.creatives.filter(
          (c) => c.offerId === offerId && c.id !== creativeId
        );
        if (!offerMayBeActive(remaining, decidableChannels(cat.placements))) {
          return json(
            {
              error: 'conflict',
              message: `'${before.name}' is the only active creative on '${offer.name}' for a channel this tenant delivers on, and '${offer.name}' is active. Pause or retire the offer first.`,
            },
            409
          );
        }
      }

      await store.catalogue.putCreative(CONSOLE_TENANT, updated, user.email, updated.updatedAt);

      const changed = Object.keys(body).filter(
        (k) =>
          JSON.stringify((before as unknown as Record<string, unknown>)[k]) !==
          JSON.stringify((body as Record<string, unknown>)[k])
      );
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'CreativeUpdated',
        scope: updated.id,
        summary: `Updated ${updated.name}${changed.length ? ` (${changed.join(', ')})` : ''}.`,
      });
      return json(updated);
    }

    // PUT /api/tenants/{tenantId}/settings. G-092.
    case 'tenants': {
      if (rest[1] !== 'settings') return notFound();
      if (!user.permissions.includes('admin:settings')) return forbidden('admin:settings');
      if (rest[0] !== store.tenantSettings.tenantId) return notFound(`No tenant ${rest[0]}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const problems = tenantSettingsProblems(body);
      if (problems.length > 0) {
        return json(
          { error: 'bad_request', message: problems.map((p) => p.message).join(' '), problems },
          400
        );
      }

      const before = store.tenantSettings;
      const updated: TenantSettings = {
        ...before,
        // Stored canonical, so `en-us` and `en-US` are one setting rather than two.
        locale: typeof body.locale === 'string' ? Intl.getCanonicalLocales(body.locale)[0] : before.locale,
        currency:
          typeof body.currency === 'string' ? (body.currency as TenantSettings['currency']) : before.currency,
        tenantId: before.tenantId,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      };
      store.tenantSettings = updated;

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'TenantSettingsChanged',
        scope: before.tenantId,
        summary: `Locale ${before.locale} → ${updated.locale}; currency ${before.currency} → ${updated.currency}.`,
      });
      return json(updated);
    }

    case 'placements': {
      if (!user.permissions.includes('edit:integrations')) return forbidden('edit:integrations');
      const placementKey = rest[1];
      const before = (await readCatalogue()).placements.find((p) => p.key === placementKey);
      if (!before) return notFound(`No placement ${placementKey}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

      if (
        typeof body.artifactId === 'string' &&
        !(await flowDraft(body.artifactId))
      ) {
        return json({ error: 'bad_request', message: `No decision flow '${body.artifactId}'.` }, 400);
      }

      const delivery = normaliseDelivery(body.delivery);
      const updated = {
        ...before,
        ...body,
        ...(delivery === undefined ? {} : { delivery }),
        id: before.id,
        // The key is what a decision request carries and what a creative names,
        // so it is stable for the life of the slot.
        key: before.key,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      };
      await store.catalogue.putPlacement(CONSOLE_TENANT, updated as Placement, user.email, updated.updatedAt);

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'PlacementUpdated',
        scope: before.id,
        summary:
          `Updated placement ${updated.name}: decidable ${updated.decidable}, ` +
          `delivery ${updated.delivery ? updated.delivery.mode : 'none'}.`,
      });
      return json(updated);
    }

    case 'objectives': {
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');
      const objectiveId = rest[1];
      const before = (await readCatalogue()).objectives.find((o) => o.id === objectiveId);
      if (!before) return notFound(`No objective ${objectiveId}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      // The key and the id are what everything below is filed under, so an
      // edit cannot move them. The descriptor locks the key in the form; this
      // is the same rule where a caller cannot see the form.
      const updated = {
        ...before,
        ...body,
        id: before.id,
        key: before.key,
        updatedAt: new Date().toISOString(),
      };
      await store.catalogue.putObjective(CONSOLE_TENANT, updated as Objective, user.email, updated.updatedAt);

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'ObjectiveUpdated',
        scope: objectiveId,
        summary: `Updated objective ${updated.name}.`,
      });
      return json(updated);
    }

    case 'categories': {
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');
      const categoryId = rest[1];
      const cat = await readCatalogue();
      const before = cat.categories.find((c) => c.id === categoryId);
      if (!before) return notFound(`No category ${categoryId}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

      // Re-filing a category under a different objective is allowed; filing it
      // under one that does not exist is not, at edit as at creation.
      if (
        typeof body.objectiveId === 'string' &&
        !cat.objectives.some((o) => o.id === body.objectiveId)
      ) {
        return json(
          { error: 'bad_request', message: `No objective '${body.objectiveId}'.` },
          400
        );
      }

      const updated = {
        ...before,
        ...body,
        id: before.id,
        key: before.key,
        updatedAt: new Date().toISOString(),
      };
      await store.catalogue.putCategory(CONSOLE_TENANT, updated as Category, user.email, updated.updatedAt);

      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'CategoryUpdated',
        scope: categoryId,
        summary: `Updated category ${updated.name}.`,
      });
      return json(updated);
    }

    case 'offers': {
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');
      const offerId = rest[1];
      const cat = await readCatalogue();
      const before = cat.offers.find((p) => p.id === offerId);
      if (!before) return notFound(`No offer ${offerId}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

      // Same invariant as creation, at the other moment it can be broken.
      if (body.status === 'active' && before.status !== 'active') {
        const own = cat.creatives.filter((c) => c.offerId === before.id);
        const served = decidableChannels(cat.placements);
        if (!offerMayBeActive(own, served)) {
          return json(
            {
              error: 'conflict',
              message: `'${before.name}' has no active creative on any channel this tenant delivers on (${served.sort().join(', ')}), so it cannot be activated — it would win decisions with nothing to render.`,
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
      await store.catalogue.putOffer(CONSOLE_TENANT, updated as Offer, user.email, updated.updatedAt);

      const changed = Object.keys(body).filter(
        (k) => JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify(body[k])
      );

      await recordAudit({
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

/**
 * DELETE — three proposed operations (G-110). No plane serves a delete for any
 * of these records; this does, so the screens can be built against them.
 *
 * Each refuses rather than cascades while something still depends on the
 * record: an offer bound to the policy, a creative naming the slot, an active
 * offer whose last deliverable content this is. A delete that quietly changed
 * what decisions do would be a decision nobody made.
 */
async function handleDelete(req: Request, { params }: Ctx) {
  const { path } = await params;
  const [head, ...rest] = path;
  await store.ledgerReady;
  const user = actor(req);
  if (!user) return json({ error: 'no_session' }, 401);

  switch (head) {
    case 'targeting-policies': {
      // DELETE /api/targeting-policies/{tenantId}/{policyId}
      if (!user.permissions.includes('edit:policies')) return forbidden('edit:policies');
      const [, policyId] = rest;
      const cat = await readCatalogue();
      const policy = cat.targetingPolicies.find((p) => p.id === policyId);
      if (!policy) return notFound(`No policy ${policyId}`);

      const bound = cat.offers.filter((o) => o.policyIds.includes(policy.id));
      if (bound.length > 0) {
        return json(
          {
            error: 'conflict',
            message: `'${policy.name}' applies to ${bound.map((o) => `'${o.name}'`).join(', ')}, so deleting it would change who ${bound.length === 1 ? 'that offer reaches' : 'those offers reach'}. Deactivate it instead: it is stored and stops applying.`,
          },
          409
        );
      }

      await store.catalogue.deleteTargetingPolicy(CONSOLE_TENANT, policy.id, user.email, new Date().toISOString());
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'TargetingPolicyDeleted',
        scope: policy.id,
        summary: `Deleted ${policy.kind} policy '${policy.name}'.`,
      });
      return new Response(null, { status: 204 });
    }

    case 'placements': {
      // DELETE /api/placements/{tenantId}/{placementKey}
      if (!user.permissions.includes('edit:integrations')) return forbidden('edit:integrations');
      const placementKey = rest[1];
      const cat = await readCatalogue();
      const placement = cat.placements.find((p) => p.key === placementKey);
      if (!placement) return notFound(`No placement ${placementKey}`);

      const naming = cat.creatives.filter(
        (c) => (c.content as { placement?: string }).placement === placement.key
      );
      if (naming.length > 0) {
        return json(
          {
            error: 'conflict',
            message: `${naming.map((c) => `'${c.name}'`).join(', ')} ${naming.length === 1 ? 'names' : 'name'} '${placement.key}'. Point ${naming.length === 1 ? 'it' : 'them'} at another slot first: content aimed at a slot that does not exist cannot be delivered.`,
          },
          409
        );
      }

      await store.catalogue.deletePlacement(CONSOLE_TENANT, placement.id, user.email, new Date().toISOString());
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'PlacementDeleted',
        scope: placement.key,
        summary: `Deleted placement '${placement.key}'.`,
      });
      return new Response(null, { status: 204 });
    }

    case 'creatives': {
      // DELETE /api/creatives/{tenantId}/{offerId}/{creativeId}
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');
      const [, offerId, creativeId] = rest;
      const cat = await readCatalogue();
      const offer = cat.offers.find((p) => p.id === offerId);
      if (!offer) return notFound(`No offer ${offerId}`);
      const creative = cat.creatives.find((c) => c.id === creativeId && c.offerId === offerId);
      if (!creative) return notFound(`No creative ${creativeId} on offer ${offerId}`);

      // The same rule as switching one off, for the same reason: an active
      // offer would keep winning decisions with nothing to render.
      if (creative.active && offer.status === 'active') {
        const remaining = cat.creatives.filter((c) => c.offerId === offerId && c.id !== creativeId);
        if (!offerMayBeActive(remaining, decidableChannels(cat.placements))) {
          return json(
            {
              error: 'conflict',
              message: `'${creative.name}' is the only active creative on '${offer.name}' for a channel this tenant delivers on, and '${offer.name}' is active. Pause or retire the offer first.`,
            },
            409
          );
        }
      }

      const at = new Date().toISOString();
      await store.catalogue.deleteCreative(CONSOLE_TENANT, creative.id, user.email, at);
      await store.catalogue.putOffer(
        CONSOLE_TENANT,
        { ...offer, creativeIds: offer.creativeIds.filter((id) => id !== creative.id) },
        user.email,
        at
      );
      await recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'CreativeDeleted',
        scope: creative.id,
        summary: `Deleted ${creative.name} from '${offer.name}'.`,
      });
      return new Response(null, { status: 204 });
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
/**
 * A write the catalogue refused after the handler's own checks passed.
 *
 * The handlers check keys and references before writing, with the answers
 * they have always given. But the check and the write are separate awaits
 * against a shared store, so a second request can land between them — and
 * then the catalogue's own rule, or the database's constraint behind it,
 * refuses the write. That is a conflict the caller can act on, not a 500.
 * Mapped once, here, rather than at forty write sites.
 */
function refusingCatalogueErrors(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (!(e instanceof CatalogueError)) throw e;
      const conflict = e.code === 'DUPLICATE_KEY' || e.code === 'OFFER_IN_USE';
      return json(
        { error: conflict ? 'conflict' : 'bad_request', code: e.code, message: e.message },
        conflict ? 409 : 400
      );
    }
  };
}

export const GET = recorded('GET', refusingCatalogueErrors(handleGet));
export const POST = recorded('POST', refusingCatalogueErrors(handlePost));
export const PUT = recorded('PUT', refusingCatalogueErrors(handlePut));
export const DELETE = recorded('DELETE', refusingCatalogueErrors(handleDelete));
