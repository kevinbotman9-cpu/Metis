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
import { compilations, findCompilation } from '@/mocks/fixtures/compiled';
import { replay as replayDecision } from '@metis/runtime/deterministic/engine';

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

/** Resolve the effective autonomy for a proposition, most specific scope first. */
function resolveAutonomyFor(propositionId: string, groupId: string, issueId: string) {
  const a = store.autonomy;
  return (
    a.find((s) => s.scope.level === 'proposition' && s.scope.targetId === propositionId) ||
    a.find((s) => s.scope.level === 'group' && s.scope.targetId === groupId) ||
    a.find((s) => s.scope.level === 'issue' && s.scope.targetId === issueId) ||
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
        issues: store.issues,
        groups: store.groups,
        propositions: store.propositions,
      });

    case 'propositions': {
      const propositionId = rest[1];
      if (propositionId) {
        const proposition = store.propositions.find((p) => p.id === propositionId);
        if (!proposition) return notFound(`No proposition ${propositionId}`);
        return json({
          proposition,
          treatments: store.treatments.filter((t) => t.propositionId === proposition.id),
          policies: store.engagementPolicies.filter((p) =>
            proposition.policyIds.includes(p.id)
          ),
          autonomy: resolveAutonomyFor(
            proposition.id,
            proposition.groupId,
            proposition.issueId
          ),
        });
      }

      let result = store.propositions;
      const issueId = q.get('issueId');
      const groupId = q.get('groupId');
      const status = q.get('status');
      const search = (q.get('q') || '').toLowerCase().trim();

      if (issueId) result = result.filter((p) => p.issueId === issueId);
      if (groupId) result = result.filter((p) => p.groupId === groupId);
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
      return json({ propositions: result, total: result.length });
    }

    case 'treatments':
      return json({
        treatments: store.treatments.filter((t) => t.propositionId === rest[1]),
      });

    case 'engagement-policies': {
      const kind = q.get('kind');
      return json({
        policies: kind
          ? store.engagementPolicies.filter((p) => p.kind === kind)
          : store.engagementPolicies,
      });
    }

    case 'contact-policies':
      return json({ policies: store.contactPolicies });

    case 'arbitration':
      return json({ config: store.arbitration, levers: store.levers });

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

    case 'change-requests': {
      if (rest[0]) {
        const cr = store.changeRequests.find((c) => c.id === rest[0]);
        return cr ? json(cr) : notFound(`No change request ${rest[0]}`);
      }
      const status = q.get('status');
      const result = status
        ? store.changeRequests.filter((c) => c.status === status)
        : store.changeRequests;
      return json({ changeRequests: result, total: result.length });
    }

    case 'audit': {
      const limit = Number(q.get('limit') || 100);
      return json({ events: store.auditEvents.slice(0, limit), total: store.auditEvents.length });
    }

    case 'artifacts': {
      if (rest[1]) {
        const artifact = store.artifacts.find((a) => a.id === rest[1]);
        if (!artifact) return notFound(`No strategy ${rest[1]}`);
        // The compiler's verdict travels with the strategy: a console that
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
      if (rest[1] !== 'replay') return notFound();

      // A real re-execution, not a canned answer: the engine runs again against
      // the recorded artifact, the catalogue and the original inputs, and the
      // chain hashes are compared. If a policy or lever has since been edited,
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

    case 'change-requests': {
      const user = actor(req);
      if (!user) return json({ error: 'no_session' }, 401);
      if (!user.permissions.includes('approve:changes')) return forbidden('approve:changes');

      const cr = store.changeRequests.find((c) => c.id === rest[0]);
      if (!cr) return notFound(`No change request ${rest[0]}`);
      if (cr.status !== 'pending') {
        return json(
          {
            error: 'already_decided',
            message: `This change request was already ${cr.status}.`,
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
      if (approving) applyChangeRequest(cr);

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: approving ? 'ChangeRequestApproved' : 'ChangeRequestRejected',
        scope: cr.targetScope.targetId ?? 'tenant',
        summary: `${approving ? 'Approved' : 'Rejected'} ${cr.id}: ${cr.title}`,
        changeRequestId: cr.id,
      });

      return json(cr);
    }

    // Test-only: restore seed state between E2E specs.
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
 * Apply an approved change request's diff to the store.
 *
 * Only the change types the console can currently raise are handled; anything
 * else is approved for the record but leaves the data untouched, which is
 * honest rather than silently pretending.
 */
function applyChangeRequest(cr: (typeof store.changeRequests)[number]) {
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
      )} × L^${w.lever.toFixed(2)} × C^${w.context.toFixed(2)}`;
      break;
    }
    case 'lever_adjust': {
      for (const d of cr.diff) {
        const leverId = d.field.split('.')[0];
        const lever = store.levers.find((l) => l.id === leverId);
        if (lever) lever.value = Number(d.after);
      }
      break;
    }
    case 'policy_edit': {
      for (const d of cr.diff) {
        // e.g. "pol_heavy_user.conditions[0].value"
        const match = d.field.match(/^(\w+)\.conditions\[(\d+)\]\.value$/);
        if (match) {
          const policy = store.engagementPolicies.find((p) => p.id === match[1]);
          const cond = policy?.conditions[Number(match[2])];
          if (cond) cond.value = Number(d.after);
          continue;
        }
        const activeMatch = d.field.match(/^(\w+)\.active$/);
        if (activeMatch) {
          const policy = store.engagementPolicies.find((p) => p.id === activeMatch[1]);
          if (policy) policy.active = d.after === 'true';
        }
      }
      break;
    }
    case 'proposition_retire': {
      const prop = store.propositions.find((p) => p.id === cr.targetScope.targetId);
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
      )} × L^${w.lever.toFixed(2)} × C^${w.context.toFixed(2)}`;
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

    case 'propositions': {
      if (!user.permissions.includes('edit:propositions')) return forbidden('edit:propositions');
      const propositionId = rest[1];
      const index = store.propositions.findIndex((p) => p.id === propositionId);
      if (index === -1) return notFound(`No proposition ${propositionId}`);

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const before = store.propositions[index];
      const updated = {
        ...before,
        ...body,
        id: before.id,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email,
      };
      store.propositions[index] = updated;

      const changed = Object.keys(body).filter(
        (k) => JSON.stringify((before as unknown as Record<string, unknown>)[k]) !== JSON.stringify(body[k])
      );

      recordAudit({
        actor: user.email,
        actorType: 'human',
        eventType: 'PropositionUpdated',
        scope: propositionId,
        summary: `Updated ${updated.name}${changed.length ? ` (${changed.join(', ')})` : ''}.`,
      });
      return json(updated);
    }

    default:
      return notFound(`No route for /${path.join('/')}`);
  }
}
