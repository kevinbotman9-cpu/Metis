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
import { findGenerated, catalogueSnapshot } from '@/mocks/fixtures/engine';
import { compilations, findCompilation, compileContext } from '@/mocks/fixtures/compiled';
import type { DecisionFlowSource } from '@metis/compiler/decision-flow';
import {
  replay as replayDecision,
  execute as executeDecision,
} from '@metis/runtime/deterministic/engine';
import { execArtifacts } from '@/mocks/fixtures/engine';
import type { DecisionRequest } from '@metis/runtime/deterministic/types';

/** The request half of an executeDecision body, as the spec declares it. */
type DecisionRequestBody = Partial<DecisionRequest> &
  Pick<DecisionRequest, 'tenantId' | 'customerId' | 'channel' | 'placement'>;

type Ctx = { params: Promise<{ path: string[] }> };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
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

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: Ctx) {
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

    case 'creatives':
      return json({
        creatives: store.creatives.filter((t) => t.offerId === rest[1]),
      });

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
        if (!trace) return notFound(`No decision with id ${rest[0]}`);
        return json(trace);
      }
      return notFound();
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

export async function POST(req: Request, { params }: Ctx) {
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

        const trace = executeDecision(artifact, catalogueSnapshot, {
          tenantId: body.request.tenantId,
          customerId: body.request.customerId,
          channel: body.request.channel,
          placement: body.request.placement,
          occurredAt: body.request.occurredAt,
          input: body.request.input ?? {},
          contactHistory: body.request.contactHistory,
          consent: body.request.consent,
        });

        return json({ id: trace.id, decision: trace.decision, chainHash: trace.chainHash });
      }

      if (rest[1] !== 'replay') return notFound();

      // A real re-execution, not a canned answer: the engine runs again against
      // the recorded artifact, the catalogue and the original inputs, and the
      // chain hashes are compared. If a policy or boost has since been edited,
      // this legitimately reports a divergence and says which field moved.
      const record = findGenerated(rest[0]);
      if (!record) return notFound(`No decision with id ${rest[0]}`);

      const result = replayDecision(
        record.artifact,
        catalogueSnapshot,
        record.trace,
        record.request.input,
        record.request.contactHistory
      );

      return json({
        identical: result.identical,
        decisionId: result.decisionId,
        replayedAt: new Date().toISOString(),
        artifactVersion: record.trace.decision.artifactVersion,
        originalWinner: record.trace.decision.winner,
        replayedWinner: result.identical
          ? record.trace.decision.winner
          : (result.differences.find((d) => d.path === '$.winner')?.replayed ?? null),
        originalChainHash: result.originalChainHash,
        replayedChainHash: result.replayedChainHash,
        diff: result.differences,
      });
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

export async function PUT(req: Request, { params }: Ctx) {
  const { path } = await params;
  const [head, ...rest] = path;
  const user = actor(req);
  if (!user) return json({ error: 'no_session' }, 401);

  switch (head) {
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

    case 'offers': {
      if (!user.permissions.includes('edit:offers')) return forbidden('edit:offers');
      const offerId = rest[1];
      const index = store.offers.findIndex((p) => p.id === offerId);
      if (index === -1) return notFound(`No offer ${offerId}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const before = store.offers[index];
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
