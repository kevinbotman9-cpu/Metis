/**
 * Development API — serves the fixture store over real HTTP.
 *
 * Why this exists alongside mocks/handlers.ts: MSW needs a service worker,
 * which will not register in every embedded browser context, and never runs
 * server-side. These route handlers read the SAME fixture store, so there is
 * still exactly one place sample data lives, and components still reach it
 * only through the generated client.
 *
 * MSW remains the mocking layer for Storybook and Vitest.
 *
 * Every route below maps to an operationId in docs/metis-api.openapi.yaml.
 */

import { NextResponse } from 'next/server';
import {
  issues,
  groups,
  propositions,
  treatments,
  engagementPolicies,
  contactPolicies,
  arbitrationConfig,
  levers,
  autonomySettings,
  agentActivity,
  users,
} from '@/mocks/fixtures/catalogue';
import { decisions, findTrace } from '@/mocks/fixtures/decisions';
import { changeRequests, auditEvents } from '@/mocks/fixtures/governance';
import { artifacts } from '@/mocks/fixtures/artifacts';

type Ctx = { params: Promise<{ path: string[] }> };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const notFound = (message = 'Not found') => json({ error: 'not_found', message }, 404);

function userFromRequest(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token.startsWith('metis.')) return null;
  return users.find((u) => u.id === token.slice('metis.'.length)) ?? null;
}

function publicUser(u: (typeof users)[number]) {
  const { password: _password, ...rest } = u;
  return rest;
}

/** Resolve the effective autonomy for a proposition, most specific scope first. */
function resolveAutonomyFor(propositionId: string, groupId: string, issueId: string) {
  return (
    autonomySettings.find(
      (a) => a.scope.level === 'proposition' && a.scope.targetId === propositionId
    ) ||
    autonomySettings.find((a) => a.scope.level === 'group' && a.scope.targetId === groupId) ||
    autonomySettings.find((a) => a.scope.level === 'issue' && a.scope.targetId === issueId) ||
    autonomySettings.find((a) => a.scope.level === 'tenant') ||
    null
  );
}

export async function GET(req: Request, { params }: Ctx) {
  const { path } = await params;
  const q = new URL(req.url).searchParams;
  const [head, ...rest] = path;

  switch (head) {
    case 'auth': {
      if (rest[0] === 'session') {
        const user = userFromRequest(req);
        if (!user) return json({ error: 'no_session' }, 401);
        return json({ user: publicUser(user) });
      }
      return notFound();
    }

    case 'taxonomy':
      return json({ issues, groups, propositions });

    case 'propositions': {
      // /propositions/:tenantId  or  /propositions/:tenantId/:propositionId
      const propositionId = rest[1];
      if (propositionId) {
        const proposition = propositions.find((p) => p.id === propositionId);
        if (!proposition) return notFound(`No proposition ${propositionId}`);
        return json({
          proposition,
          treatments: treatments.filter((t) => t.propositionId === proposition.id),
          policies: engagementPolicies.filter((p) =>
            proposition.policyIds.includes(p.id)
          ),
          autonomy: resolveAutonomyFor(
            proposition.id,
            proposition.groupId,
            proposition.issueId
          ),
        });
      }

      let result = propositions;
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

    case 'treatments': {
      const propositionId = rest[1];
      return json({
        treatments: treatments.filter((t) => t.propositionId === propositionId),
      });
    }

    case 'engagement-policies': {
      const kind = q.get('kind');
      return json({
        policies: kind ? engagementPolicies.filter((p) => p.kind === kind) : engagementPolicies,
      });
    }

    case 'contact-policies':
      return json({ policies: contactPolicies });

    case 'arbitration':
      return json({ config: arbitrationConfig, levers });

    case 'autonomy':
      return json({ settings: autonomySettings });

    case 'agent-activity': {
      const outcome = q.get('outcome');
      const limit = Number(q.get('limit') || 50);
      const list = outcome ? agentActivity.filter((a) => a.outcome === outcome) : agentActivity;
      return json({ activity: list.slice(0, limit) });
    }

    case 'decisions': {
      // /decisions/search  or  /decisions/:id/trace
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
        const cr = changeRequests.find((c) => c.id === rest[0]);
        return cr ? json(cr) : notFound(`No change request ${rest[0]}`);
      }
      const status = q.get('status');
      const result = status ? changeRequests.filter((c) => c.status === status) : changeRequests;
      return json({ changeRequests: result, total: result.length });
    }

    case 'audit': {
      const limit = Number(q.get('limit') || 100);
      return json({ events: auditEvents.slice(0, limit), total: auditEvents.length });
    }

    case 'artifacts':
      return json({ artifacts });

    default:
      return notFound(`No route for /${path.join('/')}`);
  }
}

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
      const user = users.find(
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
      const trace = findTrace(rest[0]);
      if (!trace) return notFound(`No decision with id ${rest[0]}`);
      // Determinism: replaying the pinned artifact version reproduces the trace.
      return json({
        identical: true,
        decisionId: trace.id,
        replayedAt: new Date().toISOString(),
        artifactVersion: trace.artifactVersion,
        originalWinner: trace.winner,
        replayedWinner: trace.winner,
        diff: [],
      });
    }

    case 'change-requests': {
      const cr = changeRequests.find((c) => c.id === rest[0]);
      if (!cr) return notFound(`No change request ${rest[0]}`);
      if (rest[1] === 'approve') {
        return json({ ...cr, status: 'approved', decidedAt: new Date().toISOString() });
      }
      if (rest[1] === 'reject') {
        const body = (await req.json().catch(() => ({}))) as { reason?: string };
        return json({
          ...cr,
          status: 'rejected',
          decidedAt: new Date().toISOString(),
          decisionReason: body.reason ?? null,
        });
      }
      return notFound();
    }

    default:
      return notFound(`No route for /${path.join('/')}`);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const { path } = await params;
  const [head] = path;

  // Writes are accepted and echoed back. The fixture store is read-only in
  // development; real persistence arrives with the execution plane.
  switch (head) {
    case 'arbitration': {
      const body = await req.json().catch(() => ({}));
      return json({ ...arbitrationConfig, ...(body as object) });
    }
    case 'autonomy': {
      const body = await req.json().catch(() => ({}));
      return json(body);
    }
    default:
      return notFound(`No route for /${path.join('/')}`);
  }
}
