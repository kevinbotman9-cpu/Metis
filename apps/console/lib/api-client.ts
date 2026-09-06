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
  ChangeSet as ChangeSetDto,
  CompileResult as CompileResultDto,
  FrequencyPolicy as FrequencyPolicyDto,
  Decision as DecisionDto,
  DecisionRecord as TraceDto,
  Diagnostic as DiagnosticDto,
  FlowEdge as FlowEdgeDto,
  FlowNode as FlowNodeDto,
  TargetingPolicy as TargetingPolicyDto,
  Category as CategoryDto,
  Objective as ObjectiveDto,
  Boost as BoostDto,
  Money as MoneyDto,
  PolicyScope as PolicyScopeDto,
  Offer as OfferDto,
  OfferDetail as OfferDetailDto,
  ReplayResult as ReplayResultDto,
  Connector as ConnectorDto,
  PublishedVersion as PublishedVersionDto,
  EnvironmentState as EnvironmentStateDto,
  PublishOutcome as PublishOutcomeDto,
  RegistryEvent as RegistryEventDto,
  ShadowReport as ShadowReportDto,
  SourceBinding as SourceBindingDto,
  SourceCall as SourceCallDto,
  Taxonomy as TaxonomyDto,
  Creative as CreativeDto,
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

  // --- Offers -------------------------------------------------------
  getTaxonomy: (tenantId: string = TENANT) =>
    apiCall<TaxonomyDto>(`/taxonomy/${tenantId}`),

  listOffers: (
    filters: { objectiveId?: string; categoryId?: string; status?: string; q?: string } = {},
    tenantId: string = TENANT
  ) =>
    apiCall<{ offers: OfferDto[]; total: number }>(
      `/offers/${tenantId}`,
      { query: filters }
    ),

  getOffer: (offerId: string, tenantId: string = TENANT) =>
    apiCall<OfferDetailDto>(`/offers/${tenantId}/${offerId}`),

  listCreatives: (offerId: string, tenantId: string = TENANT) =>
    apiCall<{ creatives: CreativeDto[] }>(`/creatives/${tenantId}/${offerId}`),

  updateOffer: (
    offerId: string,
    changes: Partial<OfferDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<OfferDto>(`/offers/${tenantId}/${offerId}`, {
      method: 'PUT',
      body: changes,
    }),

  // --- Policies and arbitration -------------------------------------------
  listTargetingPolicies: (kind?: string, tenantId: string = TENANT) =>
    apiCall<{ policies: TargetingPolicyDto[] }>(`/targeting-policies/${tenantId}`, {
      query: { kind },
    }),

  listFrequencyPolicies: (tenantId: string = TENANT) =>
    apiCall<{ policies: FrequencyPolicyDto[] }>(`/frequency-policies/${tenantId}`),

  getArbitration: (tenantId: string = TENANT) =>
    apiCall<{ config: ArbitrationConfigDto; boosts: BoostDto[] }>(`/arbitration/${tenantId}`),

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

  getDecisionRecord: (decisionId: string) =>
    apiCall<TraceDto>(`/decisions/${decisionId}/trace`),

  replayDecision: (decisionId: string) =>
    apiCall<ReplayResultDto>(`/decisions/${decisionId}/replay`, { method: 'POST' }),

  // --- Governance ---------------------------------------------------------
  listChangeSets: (status?: string) =>
    apiCall<{ changeSets: ChangeSetDto[]; total: number }>('/change-sets', {
      query: { status },
    }),

  getChangeSet: (id: string) => apiCall<ChangeSetDto>(`/change-sets/${id}`),

  approveChangeSet: (id: string) =>
    apiCall<ChangeSetDto>(`/change-sets/${id}/approve`, { method: 'POST' }),

  rejectChangeSet: (id: string, reason: string) =>
    apiCall<ChangeSetDto>(`/change-sets/${id}/reject`, {
      method: 'POST',
      body: { reason },
    }),

  getAuditLog: (limit = 100) =>
    apiCall<{ events: AuditEventDto[]; total: number }>('/audit', { query: { limit } }),

  // --- Integrations -------------------------------------------------------
  listConnectors: (tenantId: string = TENANT) =>
    apiCall<{ connectors: ConnectorDto[] }>(`/connectors/${tenantId}`),

  updateConnector: (connector: ConnectorDto, tenantId: string = TENANT) =>
    apiCall<ConnectorDto>(`/connectors/${tenantId}/${connector.id}`, {
      method: 'PUT',
      body: connector,
    }),

  // --- Registry -----------------------------------------------------------
  getRegistryEntry: (flowName: string, tenantId: string = TENANT) =>
    apiCall<{
      flowName: string;
      versions: PublishedVersionDto[];
      environments: EnvironmentStateDto[];
    }>(`/registry/${tenantId}/${flowName}`),

  listRegistryEvents: (
    filters: { flowName?: string; limit?: number } = {},
    tenantId: string = TENANT
  ) => apiCall<{ events: RegistryEventDto[] }>(`/registry/${tenantId}/events`, { query: filters }),

  promoteVersion: (
    flowName: string,
    version: string,
    environment: string,
    tenantId: string = TENANT
  ) =>
    apiCall<EnvironmentStateDto>(`/registry/${tenantId}/${flowName}/promote`, {
      method: 'POST',
      body: { version, environment },
    }),

  rollbackVersion: (flowName: string, environment: string, tenantId: string = TENANT) =>
    apiCall<EnvironmentStateDto>(`/registry/${tenantId}/${flowName}/rollback`, {
      method: 'POST',
      body: { environment },
    }),

  /** Null stops the shadow. */
  setShadow: (
    flowName: string,
    version: string | null,
    environment: string,
    tenantId: string = TENANT
  ) =>
    apiCall<EnvironmentStateDto>(`/registry/${tenantId}/${flowName}/shadow`, {
      method: 'POST',
      body: { version, environment },
    }),

  getShadowReport: (flowName: string, tenantId: string = TENANT) =>
    apiCall<ShadowReportDto>(`/registry/${tenantId}/${flowName}/shadow-report`),

  // --- Flows ---------------------------------------------------------
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
  ChangeSetDto,
  CompileResultDto,
  FrequencyPolicyDto,
  DecisionDto,
  TraceDto,
  DiagnosticDto,
  FlowEdgeDto,
  FlowNodeDto,
  TargetingPolicyDto,
  CategoryDto,
  ObjectiveDto,
  BoostDto,
  MoneyDto,
  PolicyScopeDto,
  OfferDto,
  OfferDetailDto,
  ReplayResultDto,
  TaxonomyDto,
  CreativeDto,
  ConnectorDto,
  PublishedVersionDto,
  EnvironmentStateDto,
  PublishOutcomeDto,
  RegistryEventDto,
  SourceBindingDto,
  SourceCallDto,
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
