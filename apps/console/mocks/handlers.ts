/**
 * MSW handlers — the single source of sample data for development.
 *
 * Every handler is derived from an operation in docs/metis-api.openapi.yaml.
 * Components never import fixtures directly; they call the client, which
 * these handlers intercept.
 */

import { http, HttpResponse } from 'msw';
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
} from './fixtures/catalogue';
import { decisions, findTrace } from './fixtures/decisions';
import { changeRequests, auditEvents } from './fixtures/governance';

const API = '*/api';

/** Token format: metis.<userId>. Good enough for a mock, and inspectable. */
function userFromAuthHeader(request: Request) {
  const header = request.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token.startsWith('metis.')) return null;
  const id = token.slice('metis.'.length);
  return users.find((u) => u.id === id) ?? null;
}

function publicUser(u: (typeof users)[number]) {
  const { password, ...rest } = u;
  return rest;
}

export const handlers = [
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const user = users.find(
      (u) => u.email.toLowerCase() === (body.email || '').toLowerCase().trim()
    );

    if (!user || user.password !== body.password) {
      return HttpResponse.json(
        { error: 'invalid_credentials', message: 'That email and password combination was not recognised.' },
        { status: 401 }
      );
    }

    return HttpResponse.json({ token: `metis.${user.id}`, user: publicUser(user) });
  }),

  http.get(`${API}/auth/session`, ({ request }) => {
    const user = userFromAuthHeader(request);
    if (!user) {
      return HttpResponse.json({ error: 'no_session' }, { status: 401 });
    }
    return HttpResponse.json({ user: publicUser(user) });
  }),

  // -------------------------------------------------------------------------
  // Proposition taxonomy
  // -------------------------------------------------------------------------

  http.get(`${API}/taxonomy/:tenantId`, () =>
    HttpResponse.json({ issues, groups, propositions })
  ),

  http.get(`${API}/propositions/:tenantId`, ({ request }) => {
    const url = new URL(request.url);
    const issueId = url.searchParams.get('issueId');
    const groupId = url.searchParams.get('groupId');
    const status = url.searchParams.get('status');
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();

    let result = propositions;
    if (issueId) result = result.filter((p) => p.issueId === issueId);
    if (groupId) result = result.filter((p) => p.groupId === groupId);
    if (status) result = result.filter((p) => p.status === status);
    if (q) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return HttpResponse.json({ propositions: result, total: result.length });
  }),

  http.get(`${API}/propositions/:tenantId/:propositionId`, ({ params }) => {
    const proposition = propositions.find((p) => p.id === params.propositionId);
    if (!proposition) {
      return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const propTreatments = treatments.filter((t) => t.propositionId === proposition.id);
    const policies = engagementPolicies.filter((p) => proposition.policyIds.includes(p.id));
    const autonomy =
      autonomySettings.find(
        (a) => a.scope.level === 'proposition' && a.scope.targetId === proposition.id
      ) ||
      autonomySettings.find(
        (a) => a.scope.level === 'group' && a.scope.targetId === proposition.groupId
      ) ||
      autonomySettings.find(
        (a) => a.scope.level === 'issue' && a.scope.targetId === proposition.issueId
      ) ||
      autonomySettings.find((a) => a.scope.level === 'tenant');

    return HttpResponse.json({ proposition, treatments: propTreatments, policies, autonomy });
  }),

  http.get(`${API}/treatments/:tenantId/:propositionId`, ({ params }) =>
    HttpResponse.json({
      treatments: treatments.filter((t) => t.propositionId === params.propositionId),
    })
  ),

  // -------------------------------------------------------------------------
  // Policies and arbitration
  // -------------------------------------------------------------------------

  http.get(`${API}/engagement-policies/:tenantId`, ({ request }) => {
    const kind = new URL(request.url).searchParams.get('kind');
    const policies = kind
      ? engagementPolicies.filter((p) => p.kind === kind)
      : engagementPolicies;
    return HttpResponse.json({ policies });
  }),

  http.get(`${API}/contact-policies/:tenantId`, () =>
    HttpResponse.json({ policies: contactPolicies })
  ),

  http.get(`${API}/arbitration/:tenantId`, () =>
    HttpResponse.json({ config: arbitrationConfig, levers })
  ),

  // -------------------------------------------------------------------------
  // Agentic autonomy
  // -------------------------------------------------------------------------

  http.get(`${API}/autonomy/:tenantId`, () =>
    HttpResponse.json({ settings: autonomySettings })
  ),

  http.get(`${API}/agent-activity/:tenantId`, ({ request }) => {
    const url = new URL(request.url);
    const outcome = url.searchParams.get('outcome');
    const limit = Number(url.searchParams.get('limit') || 50);
    let activity = agentActivity;
    if (outcome) activity = activity.filter((a) => a.outcome === outcome);
    return HttpResponse.json({ activity: activity.slice(0, limit) });
  }),

  // -------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------

  http.get(`${API}/decisions/search`, ({ request }) => {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const channel = url.searchParams.get('channel');
    const customerId = url.searchParams.get('customerId');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const outcome = url.searchParams.get('outcome');
    const limit = Number(url.searchParams.get('limit') || 50);

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

    return HttpResponse.json({
      decisions: sorted.slice(0, limit),
      total: sorted.length,
    });
  }),

  http.get(`${API}/decisions/:decisionId/trace`, ({ params }) => {
    const trace = findTrace(String(params.decisionId));
    if (!trace) {
      return HttpResponse.json(
        { error: 'not_found', message: `No decision with id ${params.decisionId}` },
        { status: 404 }
      );
    }
    return HttpResponse.json(trace);
  }),

  http.post(`${API}/decisions/:decisionId/replay`, ({ params }) => {
    const trace = findTrace(String(params.decisionId));
    if (!trace) {
      return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // Determinism: replaying the stored artifact version reproduces the trace.
    return HttpResponse.json({
      identical: true,
      decisionId: trace.id,
      replayedAt: new Date().toISOString(),
      artifactVersion: trace.artifactVersion,
      originalWinner: trace.winner,
      replayedWinner: trace.winner,
      diff: [],
    });
  }),

  // -------------------------------------------------------------------------
  // Change requests and audit
  // -------------------------------------------------------------------------

  http.get(`${API}/change-requests`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status');
    const result = status ? changeRequests.filter((c) => c.status === status) : changeRequests;
    return HttpResponse.json({ changeRequests: result, total: result.length });
  }),

  http.get(`${API}/change-requests/:id`, ({ params }) => {
    const cr = changeRequests.find((c) => c.id === params.id);
    if (!cr) return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    return HttpResponse.json(cr);
  }),

  http.post(`${API}/change-requests/:id/approve`, ({ params }) => {
    const cr = changeRequests.find((c) => c.id === params.id);
    if (!cr) return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    return HttpResponse.json({ ...cr, status: 'approved', decidedAt: new Date().toISOString() });
  }),

  http.post(`${API}/change-requests/:id/reject`, ({ params }) => {
    const cr = changeRequests.find((c) => c.id === params.id);
    if (!cr) return HttpResponse.json({ error: 'not_found' }, { status: 404 });
    return HttpResponse.json({ ...cr, status: 'rejected', decidedAt: new Date().toISOString() });
  }),

  http.get(`${API}/audit`, ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get('limit') || 100);
    return HttpResponse.json({ events: auditEvents.slice(0, limit), total: auditEvents.length });
  }),

  // -------------------------------------------------------------------------
  // Artifacts / strategies
  // -------------------------------------------------------------------------

  http.get(`${API}/artifacts/:tenantId`, () =>
    HttpResponse.json({
      artifacts: [
        {
          id: 'next-best-action',
          name: 'Next Best Action',
          activeVersion: '2.4.0',
          versions: ['2.4.0', '2.3.1', '2.3.0', '2.2.0'],
          nodeCount: 5,
          estimatedP95LatencyMs: 11.4,
          status: 'active',
          updatedAt: new Date(Date.parse('2026-09-01T09:00:00Z') - 12 * 3600_000).toISOString(),
          updatedBy: 'marcus.webb@telco.example',
        },
        {
          id: 'inbound-web-offers',
          name: 'Inbound Web Offers',
          activeVersion: '1.8.2',
          versions: ['1.8.2', '1.8.1', '1.7.0'],
          nodeCount: 4,
          estimatedP95LatencyMs: 8.1,
          status: 'active',
          updatedAt: new Date(Date.parse('2026-09-01T09:00:00Z') - 96 * 3600_000).toISOString(),
          updatedBy: 'sarah.chen@telco.example',
        },
        {
          id: 'retention-outbound',
          name: 'Retention Outbound Queue',
          activeVersion: '3.1.0',
          versions: ['3.1.0', '3.0.4'],
          nodeCount: 7,
          estimatedP95LatencyMs: 19.7,
          status: 'active',
          updatedAt: new Date(Date.parse('2026-09-01T09:00:00Z') - 26 * 3600_000).toISOString(),
          updatedBy: 'marcus.webb@telco.example',
        },
        {
          id: 'plan-fit-nudges',
          name: 'Plan Fit Nudges',
          activeVersion: '0.4.0',
          versions: ['0.4.0'],
          nodeCount: 3,
          estimatedP95LatencyMs: 5.2,
          status: 'draft',
          updatedAt: new Date(Date.parse('2026-09-01T09:00:00Z') - 2 * 3600_000).toISOString(),
          updatedBy: 'priya.natarajan@telco.example',
        },
      ],
    })
  ),
];
