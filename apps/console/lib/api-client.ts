/**
 * METIS console API client.
 *
 * One function per operationId in docs/metis-api.openapi.yaml. Components call
 * these; never `fetch` directly. In development MSW intercepts the requests; in
 * production they reach the execution plane unchanged.
 */

import type {
  AgentActivity as AgentActivityDto,
  ArbitrationConfig as ArbitrationConfigDto,
  ArtifactSummary as ArtifactSummaryDto,
  AuditEvent as AuditEventDto,
  AuthUser as AuthUserDto,
  AutonomySetting as AutonomySettingDto,
  ChangeRequest as ChangeRequestDto,
  CompileResult as CompileResultDto,
  ContactPolicy as ContactPolicyDto,
  Decision as DecisionDto,
  DecisionTrace as TraceDto,
  Diagnostic as DiagnosticDto,
  DirEdge as DirEdgeDto,
  DirNode as DirNodeDto,
  EngagementPolicy as EngagementPolicyDto,
  Group as GroupDto,
  Issue as IssueDto,
  Lever as LeverDto,
  Money as MoneyDto,
  PolicyScope as PolicyScopeDto,
  Proposition as PropositionDto,
  PropositionDetail as PropositionDetailDto,
  ReplayResult as ReplayResultDto,
  Taxonomy as TaxonomyDto,
  Treatment as TreatmentDto,
} from '@metis/client';

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
//
// These are aliases onto types generated from docs/metis-api.openapi.yaml, not
// declarations. That is deliberate: if the spec changes shape and the console
// does not, this file stops compiling. Hand-written DTOs let the two drift for
// months without anything noticing.
//
// Regenerate with: npm run generate -w @metis/client
// ---------------------------------------------------------------------------

export type {
  AgentActivityDto,
  ArbitrationConfigDto,
  ArtifactSummaryDto,
  AuditEventDto,
  AuthUserDto,
  AutonomySettingDto,
  ChangeRequestDto,
  CompileResultDto,
  ContactPolicyDto,
  DecisionDto,
  TraceDto,
  DiagnosticDto,
  DirEdgeDto,
  DirNodeDto,
  EngagementPolicyDto,
  GroupDto,
  IssueDto,
  LeverDto,
  MoneyDto,
  PolicyScopeDto,
  PropositionDto,
  PropositionDetailDto,
  ReplayResultDto,
  TaxonomyDto,
  TreatmentDto,
};

/** Query parameters for searchDecisions, matching the spec's declared set. */
export interface DecisionSearchFilters {
  action?: string;
  channel?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  outcome?: 'offered' | 'suppressed';
  limit?: number;
}

export default apiClient;
