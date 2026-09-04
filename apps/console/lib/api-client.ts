/**
 * METIS console API client.
 *
 * One function per operationId in docs/metis-api.openapi.yaml. Components call
 * these; never `fetch` directly. In development MSW intercepts the requests; in
 * production they reach the execution plane unchanged.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

export const TOKEN_KEY = 'metis.auth.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
}

function buildQuery(query?: ApiOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function apiCall<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

  const response = await fetch(`${API_BASE}${endpoint}${buildQuery(options.query)}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let code = 'http_error';
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      code = payload.error || code;
      message = payload.message || message;
    } catch {
      // Non-JSON error body; keep the status text.
    }
    throw new ApiError(response.status, code, message);
  }

  return response.json() as Promise<T>;
}

const TENANT = 'telco-uk';

export const apiClient = {
  // --- Auth ---------------------------------------------------------------
  login: (email: string, password: string) =>
    apiCall<{ token: string; user: AuthUserDto }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  getSession: () => apiCall<{ user: AuthUserDto }>('/auth/session'),

  // --- Propositions -------------------------------------------------------
  getTaxonomy: (tenantId: string = TENANT) =>
    apiCall<TaxonomyDto>(`/taxonomy/${tenantId}`),

  listPropositions: (
    filters: { issueId?: string; groupId?: string; status?: string; q?: string } = {},
    tenantId: string = TENANT
  ) =>
    apiCall<{ propositions: PropositionDto[]; total: number }>(
      `/propositions/${tenantId}`,
      { query: filters }
    ),

  getProposition: (propositionId: string, tenantId: string = TENANT) =>
    apiCall<PropositionDetailDto>(`/propositions/${tenantId}/${propositionId}`),

  listTreatments: (propositionId: string, tenantId: string = TENANT) =>
    apiCall<{ treatments: TreatmentDto[] }>(`/treatments/${tenantId}/${propositionId}`),

  updateProposition: (
    propositionId: string,
    changes: Partial<PropositionDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<PropositionDto>(`/propositions/${tenantId}/${propositionId}`, {
      method: 'PUT',
      body: changes,
    }),

  // --- Policies and arbitration -------------------------------------------
  listEngagementPolicies: (kind?: string, tenantId: string = TENANT) =>
    apiCall<{ policies: EngagementPolicyDto[] }>(`/engagement-policies/${tenantId}`, {
      query: { kind },
    }),

  listContactPolicies: (tenantId: string = TENANT) =>
    apiCall<{ policies: ContactPolicyDto[] }>(`/contact-policies/${tenantId}`),

  getArbitration: (tenantId: string = TENANT) =>
    apiCall<{ config: ArbitrationConfigDto; levers: LeverDto[] }>(`/arbitration/${tenantId}`),

  updateArbitration: (
    weights: ArbitrationConfigDto['weights'],
    tenantId: string = TENANT
  ) =>
    apiCall<ArbitrationConfigDto>(`/arbitration/${tenantId}`, {
      method: 'PUT',
      body: { weights },
    }),

  // --- Agentic ------------------------------------------------------------
  listAutonomySettings: (tenantId: string = TENANT) =>
    apiCall<{ settings: AutonomySettingDto[] }>(`/autonomy/${tenantId}`),

  updateAutonomySetting: (
    setting: Pick<AutonomySettingDto, 'id'> & Partial<AutonomySettingDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<AutonomySettingDto>(`/autonomy/${tenantId}`, { method: 'PUT', body: setting }),

  listAgentActivity: (
    filters: { outcome?: string; limit?: number } = {},
    tenantId: string = TENANT
  ) => apiCall<{ activity: AgentActivityDto[] }>(`/agent-activity/${tenantId}`, { query: filters }),

  // --- Decisions ----------------------------------------------------------
  searchDecisions: (filters: DecisionSearchFilters = {}) =>
    apiCall<{ decisions: DecisionDto[]; total: number }>('/decisions/search', {
      query: filters as Record<string, string | number | undefined>,
    }),

  getDecisionTrace: (decisionId: string) =>
    apiCall<TraceDto>(`/decisions/${decisionId}/trace`),

  replayDecision: (decisionId: string) =>
    apiCall<ReplayResultDto>(`/decisions/${decisionId}/replay`, { method: 'POST' }),

  // --- Governance ---------------------------------------------------------
  listChangeRequests: (status?: string) =>
    apiCall<{ changeRequests: ChangeRequestDto[]; total: number }>('/change-requests', {
      query: { status },
    }),

  getChangeRequest: (id: string) => apiCall<ChangeRequestDto>(`/change-requests/${id}`),

  approveChangeRequest: (id: string) =>
    apiCall<ChangeRequestDto>(`/change-requests/${id}/approve`, { method: 'POST' }),

  rejectChangeRequest: (id: string, reason: string) =>
    apiCall<ChangeRequestDto>(`/change-requests/${id}/reject`, {
      method: 'POST',
      body: { reason },
    }),

  getAuditLog: (limit = 100) =>
    apiCall<{ events: AuditEventDto[]; total: number }>('/audit', { query: { limit } }),

  // --- Strategies ---------------------------------------------------------
  listArtifacts: (tenantId: string = TENANT) =>
    apiCall<{ artifacts: ArtifactSummaryDto[] }>(`/artifacts/${tenantId}`),

  getArtifact: (artifactId: string, tenantId: string = TENANT) =>
    apiCall<ArtifactSummaryDto>(`/artifacts/${tenantId}/${artifactId}`),
};

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
}

export interface MoneyDto {
  amount: number;
  currency: 'GBP' | 'USD' | 'EUR';
}

export interface IssueDto {
  id: string;
  name: string;
  key: string;
  description: string;
  sortOrder: number;
}

export interface GroupDto {
  id: string;
  issueId: string;
  name: string;
  key: string;
  description: string;
  sortOrder: number;
}

export interface PropositionDto {
  id: string;
  groupId: string;
  issueId: string;
  name: string;
  key: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'retired';
  financials: {
    price: MoneyDto;
    cost: MoneyDto;
    expectedMargin: MoneyDto;
    termMonths: number;
    oneOff: boolean;
  };
  validity: { startsAt: string; endsAt: string | null };
  lever: number;
  policyIds: string[];
  treatmentIds: string[];
  tags: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface TaxonomyDto {
  issues: IssueDto[];
  groups: GroupDto[];
  propositions: PropositionDto[];
}

/** getProposition returns the proposition plus everything needed to render it. */
export interface PropositionDetailDto {
  proposition: PropositionDto;
  treatments: TreatmentDto[];
  policies: EngagementPolicyDto[];
  /** Effective autonomy for this scope, or null if none resolves. */
  autonomy: AutonomySettingDto | null;
}

export interface TreatmentDto {
  id: string;
  propositionId: string;
  name: string;
  channel: 'email' | 'sms' | 'web' | 'push' | 'outbound_call';
  content: Record<string, string>;
  active: boolean;
  locale: string;
  updatedAt: string;
}

export interface PolicyScopeDto {
  level: 'tenant' | 'issue' | 'group' | 'proposition';
  targetId: string | null;
}

export interface EngagementPolicyDto {
  id: string;
  name: string;
  kind: 'eligibility' | 'applicability' | 'suitability';
  description: string;
  conditions: { field: string; operator: string; value: unknown }[];
  scope: PolicyScopeDto;
  active: boolean;
}

export interface ContactPolicyDto {
  id: string;
  name: string;
  description: string;
  channel: string | null;
  maxContacts: number;
  period: 'day' | 'week' | 'month';
  cooldownDaysAfterReject: number;
  scope: PolicyScopeDto;
  active: boolean;
}

export interface ArbitrationConfigDto {
  id: string;
  tenantId: string;
  weights: { propensity: number; value: number; lever: number; context: number };
  formula: string;
  updatedAt: string;
  updatedBy: string;
}

export interface LeverDto {
  id: string;
  name: string;
  scope: PolicyScopeDto;
  value: number;
  reason: string;
  validity: { startsAt: string; endsAt: string | null } | null;
  updatedAt: string;
  updatedBy: string;
}

export interface AutonomySettingDto {
  id: string;
  scope: PolicyScopeDto;
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  guardrails: {
    maxBlastRadiusPct: number;
    allowedChangeTypes: string[];
    maxLeverDelta: number;
    maxBudgetDelta: MoneyDto;
    protectedAttributes: string[];
    requireSimulationPass: boolean;
    biasGateThreshold: number;
  };
  rationale: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AgentActivityDto {
  id: string;
  timestamp: string;
  agentId: string;
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  scope: PolicyScopeDto;
  changeType: string;
  summary: string;
  outcome: 'suggested' | 'proposed' | 'auto_applied' | 'reverted' | 'blocked';
  guardrailBreached: string | null;
  changeRequestId: string | null;
}

export interface DecisionSearchFilters {
  action?: string;
  channel?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  outcome?: string;
  limit?: number;
}

export interface DecisionDto {
  id: string;
  artifactId: string;
  artifactVersion: string;
  tenantId: string;
  customerId: string;
  timestamp: string;
  channel: string;
  placement: string;
  winner: string | null;
  winnerPropositionId: string | null;
  candidateCount: number;
  totalMs: number;
}

export interface TraceDto extends DecisionDto {
  eliminations: {
    nodeId: string;
    nodeType: string;
    reason: string;
    eliminated: string[];
    survived: string[];
  }[];
  scores: Record<
    string,
    { propensity: number; value: number; lever: number; context: number; priority: number }
  >;
  arbitration: { formula: string; winner: string | null; runnerUp: string | null };
  timings: Record<string, number>;
  constraintsApplied: string[];
  consentState: { marketing: boolean; profiling: boolean; thirdParty: boolean };
  treatmentId: string | null;
  chainHash: string;
  inputSnapshotHash: string;
}

export interface ReplayResultDto {
  identical: boolean;
  decisionId: string;
  replayedAt: string;
  artifactVersion: string;
  originalWinner: string | null;
  replayedWinner: string | null;
  /** sha256 over the reproducible half of the decision, then and now. */
  originalChainHash: string;
  replayedChainHash: string;
  diff: { path: string; original: unknown; replayed: unknown }[];
}

export interface ChangeRequestDto {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  autonomyTier: 1 | 2 | 3;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  targetScope: { level: string; targetId: string | null };
  changeType: string;
  diff: { field: string; before: string; after: string }[];
  simulation: {
    ran: boolean;
    passed: boolean;
    populationSize: number;
    projectedMarginDelta: string;
    biasRatio: number;
    notes: string;
  } | null;
}

export interface AuditEventDto {
  id: string;
  timestamp: string;
  actor: string;
  actorType: 'human' | 'agent' | 'system';
  eventType: string;
  scope: string;
  summary: string;
  changeRequestId: string | null;
}

export interface DirNodeDto {
  id: string;
  type: string;
  label: string;
  description: string;
  estimatedMs: number;
  policyIds?: string[];
  model?: { id: string; version: string };
  formula?: string;
  position: { x: number; y: number };
}

export interface DirEdgeDto {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface DiagnosticDto {
  severity: 'error' | 'warning';
  code: string;
  at?: string;
  message: string;
  remedy?: string;
}

export interface CompileResultDto {
  ok: boolean;
  diagnostics: DiagnosticDto[];
  artifact: {
    packageVersions: Record<string, string>;
    artifactHash: string;
    compiledAt: string;
    costManifest: {
      nodeCount: number;
      criticalPathMs: number;
      worstCaseMs: number;
      modelInvocations: { nodeId: string; model: string }[];
      latencyBudgetMs: number;
      withinBudget: boolean;
    };
  } | null;
}

export interface ArtifactSummaryDto {
  id: string;
  name: string;
  description: string;
  activeVersion: string;
  versions: string[];
  nodeCount: number;
  estimatedP95LatencyMs: number;
  status: string;
  candidateKeys: string[];
  nodes: DirNodeDto[];
  edges: DirEdgeDto[];
  updatedAt: string;
  updatedBy: string;
  /** Compile summary, on the list endpoint. */
  compileOk?: boolean | null;
  errorCount?: number;
  warningCount?: number;
  /** Full compiler output, on the detail endpoint. */
  compilation?: CompileResultDto | null;
}

export default apiClient;
