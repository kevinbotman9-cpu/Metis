import { http, HttpResponse } from 'msw';

// Mock data generators
const mockArtifact = (id: string, version: string = '1.0.0') => ({
  id,
  version,
  metadata: {
    id,
    version,
    tenantId: 'telco-uk',
    createdAt: new Date().toISOString(),
    createdBy: 'agent-001',
    signature: 'sig_' + Math.random().toString(36).slice(2),
  },
  dirSchema: {
    id,
    nodes: [
      { id: 'source_1', type: 'source' },
      { id: 'filter_1', type: 'filter' },
      { id: 'arbitrate_1', type: 'arbitrate' },
    ],
    edges: [
      { from: 'source_1', to: 'filter_1' },
      { from: 'filter_1', to: 'arbitrate_1' },
    ],
  },
  costManifest: {
    computeNodes: 3,
    modelInvocations: [],
    externalCalls: 0,
    estimatedP95LatencyMs: 12,
  },
});

const mockDecision = (id: string, artifactId: string = 'test-strategy') => ({
  id,
  artifactId,
  tenantId: 'telco-uk',
  customerId: 'cust_' + Math.random().toString(36).slice(2),
  timestamp: new Date().toISOString(),
  decision: {
    winner: 'upsell_5g',
    candidates: [
      { id: 'upsell_5g', score: 0.87 },
      { id: 'upsell_data', score: 0.62 },
      { id: 'suppress', score: 0 },
    ],
  },
});

const mockTrace = (decisionId: string) => ({
  id: decisionId,
  decisionId,
  tenantId: 'telco-uk',
  timestamp: new Date().toISOString(),
  artifactVersion: '1.0.0',
  candidateSet: ['upsell_5g', 'upsell_data', 'suppress'],
  eliminations: [
    { nodeId: 'filter_1', reason: 'age > 65', eliminated: [] },
    { nodeId: 'arbitrate_1', reason: 'ranking', winner: 'upsell_5g' },
  ],
  scores: {
    upsell_5g: 0.87,
    upsell_data: 0.62,
  },
  arbitration: {
    formula: 'propensity * value',
    winner: 'upsell_5g',
  },
  constraints: [],
  timings: {
    source_1: 3.2,
    filter_1: 1.8,
    arbitrate_1: 2.1,
  },
});

const mockChangeRequest = (id: string) => ({
  id,
  artifactId: 'test-strategy',
  version: '1.1.0',
  createdBy: 'alice@company.com',
  createdAt: new Date().toISOString(),
  status: 'pending',
  autonomyTier: 1,
  reason: 'Increase upsell propensity weight',
  proposedChanges: {
    arbitrationFormula: 'propensity * 1.2 * value',
  },
  simulationResult: {
    lift: 0.15,
    bias: 'low',
  },
  biasCheckPassed: true,
  approvals: [],
  rejections: [],
});

// MSW HTTP handlers
export const handlers = [
  // === Artifact Registry ===
  http.post('/api/artifacts/:tenantId/:strategyName', ({ params }) => {
    return HttpResponse.json(
      {
        success: true,
        artifactId: (params as any).strategyName,
      },
      { status: 201 }
    );
  }),

  http.get('/api/artifacts/:tenantId/:strategyName', ({ params, request }) => {
    const url = new URL(request.url);
    const version = url.searchParams.get('version');

    return HttpResponse.json(
      mockArtifact((params as any).strategyName, version || '1.0.0')
    );
  }),

  http.get('/api/artifacts/:tenantId/:strategyName/versions', ({ params }) => {
    return HttpResponse.json({
      versions: ['1.0.0', '1.1.0', '1.2.0'],
    });
  }),

  http.post('/api/artifacts/:tenantId/:strategyName/promote', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/artifacts/:tenantId/:strategyName/rollback', () => {
    return HttpResponse.json({ success: true, version: '1.0.0' });
  }),

  http.get('/api/artifacts/:tenantId/:strategyName/audit', () => {
    return HttpResponse.json({
      audit: [
        {
          timestamp: new Date().toISOString(),
          action: 'published',
          actor: 'agent-001',
          details: { version: '1.2.0' },
        },
      ],
    });
  }),

  // === Decision Search & Trace ===
  http.post('/api/decisions/search', () => {
    const decisions = Array.from({ length: 10 }, (_, i) => {
      const id = `dec_${Math.random().toString(36).slice(2)}`;
      return mockDecision(id);
    });

    return HttpResponse.json({
      decisions,
      nextCursor: 'cursor_' + Math.random().toString(36).slice(2),
    });
  }),

  http.get('/api/decisions/:decisionId/trace', ({ params }) => {
    return HttpResponse.json(mockTrace((params as any).decisionId));
  }),

  http.post('/api/decisions/:decisionId/replay', ({ params }) => {
    const original = mockTrace((params as any).decisionId);
    const replayed = { ...original, timestamp: new Date().toISOString() };

    return HttpResponse.json({
      original,
      replayed,
      identical: true,
    });
  }),

  // === Change Requests ===
  http.post('/api/change-requests', () => {
    const id = 'cr_' + Math.random().toString(36).slice(2);
    return HttpResponse.json(mockChangeRequest(id), { status: 201 });
  }),

  http.get('/api/change-requests/:requestId', ({ params }) => {
    return HttpResponse.json(mockChangeRequest((params as any).requestId));
  }),

  http.post('/api/change-requests/:requestId/approve', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('/api/change-requests/:requestId/reject', () => {
    return HttpResponse.json({ success: true });
  }),

  // === Simulation ===
  http.post('/api/simulations', () => {
    return HttpResponse.json({
      distribution: {
        upsell_5g: 0.35,
        upsell_data: 0.28,
        suppress: 0.37,
      },
      funnel: [
        { stage: 'eligible', count: 1000000 },
        { stage: 'after_filter', count: 876543 },
        { stage: 'after_arbitrate', count: 876543 },
      ],
      bias: {
        protected_attributes: {
          age: { parity: 0.94, min_group: '18-25', max_group: '65+' },
          geography: { parity: 0.91, min_group: 'rural', max_group: 'urban' },
        },
      },
    });
  }),

  // === Counterfactuals ===
  http.post('/api/counterfactuals', () => {
    return HttpResponse.json({
      inputDiff: {
        age: { from: 28, to: 68 },
      },
      newOutcome: 'suppress',
    });
  }),
];
