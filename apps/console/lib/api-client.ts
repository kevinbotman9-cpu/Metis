/**
 * METIS console API client.
 *
 * One function per operationId in docs/metis-api.openapi.yaml. Components call
 * these; never `fetch` directly. In development MSW intercepts the requests; in
 * production they reach the execution plane unchanged.
 *
 * Neither the path nor the method is written here any more — both come from
 * `OPERATIONS`, generated from the spec. See `resolve` below.
 *
 * Four functions are named differently from the operation they call:
 * `getArbitration`, `updateArbitration`, `getAuditLog` and `getArtifact`. The
 * names are kept because components import them and renaming would churn call
 * sites for no behavioural gain; the operation id beside each is the truth, and
 * `tests/api-paths.test.ts` checks every one exists.
 */

import { OPERATIONS, type OperationId } from '@metis/client';
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
  Placement as PlacementDto,
} from '@metis/client';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

export const TOKEN_KEY = 'metis.auth.token';

/** One field a write was refused over. Mirrors `CreativeRejected` in the spec. */
export interface FieldProblem {
  /** Dotted path into the submitted object, e.g. `content.text`. */
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /**
     * Per-field reasons, where the server sent them.
     *
     * Carried rather than flattened into the message so a form can put each
     * one against the input it is about. A validation error rendered as one
     * sentence at the top of a dialog makes the person hunt for the field.
     */
    public problems: FieldProblem[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  // No `method`: it comes from the spec now. Leaving it settable would let a
  // caller send a POST to an operation the spec declares as a GET, which is
  // the drift this change removes.
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

/**
 * Build a request from the spec rather than from a string written here.
 *
 * The path and the method both come from `OPERATIONS`, generated from
 * `docs/metis-api.openapi.yaml`. This file used to write both by hand, which
 * made it one of five components that had to agree about every URL and the
 * only one nothing checked. `tests/api-paths.test.ts` closed that by
 * comparing them; deriving them closes it by construction, which is better —
 * a spec path that moves now moves here too, and an operation id that does
 * not exist is a compile error rather than a 404 at runtime.
 *
 * A missing path parameter throws here rather than sending a URL with a
 * literal brace in it, which a server answers with a confusing 404.
 */
function resolve(
  operationId: OperationId,
  params: Record<string, string | number> = {}
): { path: string; method: string } {
  const op = OPERATIONS[operationId];

  const path = op.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === '') {
      throw new Error(
        `${operationId} needs a \"${name}\" path parameter. Sending the template ` +
          'unresolved would reach the server as a literal brace and come back a 404.'
      );
    }
    return encodeURIComponent(String(value));
  });

  // Widened because `pathParams` is inferred as a literal tuple, and an
  // operation with none has element type `never`.
  const declared: readonly string[] = op.pathParams;
  const extra = Object.keys(params).filter((k) => !declared.includes(k));
  if (extra.length > 0) {
    throw new Error(
      `${operationId} takes no path parameter named ${extra.join(', ')}. ` +
        'A parameter the path does not use is a rename nobody finished.'
    );
  }

  return { path, method: op.method };
}

async function apiCall<T>(
  operationId: OperationId,
  options: ApiOptions & { params?: Record<string, string | number> } = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  const { path: endpoint, method } = resolve(operationId, options.params);

  const response = await fetch(`${API_BASE}${endpoint}${buildQuery(options.query)}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let code = 'http_error';
    let message = `${response.status} ${response.statusText}`;
    let problems: FieldProblem[] = [];
    try {
      const payload = await response.json();
      code = payload.error || code;
      message = payload.message || message;
      if (Array.isArray(payload.problems)) problems = payload.problems as FieldProblem[];
    } catch {
      // Non-JSON error body; keep the status text.
    }
    throw new ApiError(response.status, code, message, problems);
  }

  return response.json() as Promise<T>;
}

const TENANT = 'telco-uk';

export const apiClient = {
  // --- Auth ---------------------------------------------------------------
  login: (email: string, password: string) =>
    apiCall<{ token: string; user: AuthUserDto }>('login', {
      body: { email, password },
    }),

  getSession: () => apiCall<{ user: AuthUserDto }>('getSession'),

  // --- Offers -------------------------------------------------------
  getTaxonomy: (tenantId: string = TENANT) =>
    apiCall<TaxonomyDto>('getTaxonomy', { params: { tenantId } }),

  listOffers: (
    filters: { objectiveId?: string; categoryId?: string; status?: string; q?: string } = {},
    tenantId: string = TENANT
  ) =>
    apiCall<{ offers: OfferDto[]; total: number }>('listOffers', {
      params: { tenantId },
      query: filters,
    }),

  getOffer: (offerId: string, tenantId: string = TENANT) =>
    apiCall<OfferDetailDto>('getOffer', { params: { tenantId, offerId } }),

  listCreatives: (offerId: string, tenantId: string = TENANT) =>
    apiCall<{ creatives: CreativeDto[] }>('listCreatives', {
      params: { tenantId, offerId },
    }),

  createOffer: (offer: Partial<OfferDto>, tenantId: string = TENANT) =>
    apiCall<OfferDto>('createOffer', { params: { tenantId }, body: offer }),

  updateOffer: (
    offerId: string,
    changes: Partial<OfferDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<OfferDto>('updateOffer', {
      params: { tenantId, offerId },
      body: changes,
    }),

  listPlacements: (tenantId: string = TENANT) =>
    apiCall<{ placements: PlacementDto[] }>('listPlacements', { params: { tenantId } }),

  createCreative: (
    offerId: string,
    creative: Partial<CreativeDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<CreativeDto>('createCreative', {
      params: { tenantId, offerId },
      body: creative,
    }),

  updateCreative: (
    offerId: string,
    creativeId: string,
    changes: Partial<CreativeDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<CreativeDto>('updateCreative', {
      params: { tenantId, offerId, creativeId },
      body: changes,
    }),

  // --- Policies and arbitration -------------------------------------------
  listTargetingPolicies: (kind?: string, tenantId: string = TENANT) =>
    apiCall<{ policies: TargetingPolicyDto[] }>('listTargetingPolicies', {
      params: { tenantId },
      query: { kind },
    }),

  listFrequencyPolicies: (tenantId: string = TENANT) =>
    apiCall<{ policies: FrequencyPolicyDto[] }>('listFrequencyPolicies', {
      params: { tenantId },
    }),

  getArbitration: (tenantId: string = TENANT) =>
    apiCall<{ config: ArbitrationConfigDto; boosts: BoostDto[] }>('getArbitrationConfig', {
      params: { tenantId },
    }),

  updateArbitration: (
    weights: ArbitrationConfigDto['weights'],
    tenantId: string = TENANT
  ) =>
    apiCall<ArbitrationConfigDto>('updateArbitrationConfig', {
      params: { tenantId },
      body: { weights },
    }),

  // --- Agentic ------------------------------------------------------------
  listAutonomySettings: (tenantId: string = TENANT) =>
    apiCall<{ settings: AutonomySettingDto[] }>('listAutonomySettings', {
      params: { tenantId },
    }),

  updateAutonomySetting: (
    setting: Pick<AutonomySettingDto, 'id'> & Partial<AutonomySettingDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<AutonomySettingDto>('updateAutonomySetting', {
      params: { tenantId },
      body: setting,
    }),

  listAgentActivity: (
    filters: { outcome?: string; limit?: number } = {},
    tenantId: string = TENANT
  ) => apiCall<{ activity: AgentActivityDto[] }>('listAgentActivity', {
      params: { tenantId },
      query: filters,
    }),

  // --- Decisions ----------------------------------------------------------
  searchDecisions: (filters: DecisionSearchFilters = {}) =>
    apiCall<{ decisions: DecisionDto[]; total: number }>('searchDecisions', {
      query: filters as Record<string, string | number | undefined>,
    }),

  getDecisionRecord: (decisionId: string) =>
    apiCall<TraceDto>('getDecisionRecord', { params: { decisionId } }),

  replayDecision: (decisionId: string) =>
    apiCall<ReplayResultDto>('replayDecision', { params: { decisionId } }),

  // --- Governance ---------------------------------------------------------
  listChangeSets: (status?: string) =>
    apiCall<{ changeSets: ChangeSetDto[]; total: number }>('listChangeSets', {
      query: { status },
    }),

  getChangeSet: (id: string) => apiCall<ChangeSetDto>('getChangeSet', { params: { changeSetId: id } }),

  approveChangeSet: (id: string) =>
    apiCall<ChangeSetDto>('approveChangeSet', { params: { changeSetId: id } }),

  rejectChangeSet: (id: string, reason: string) =>
    apiCall<ChangeSetDto>('rejectChangeSet', {
      params: { changeSetId: id },
      body: { reason },
    }),

  getAuditLog: (limit = 100) =>
    apiCall<{ events: AuditEventDto[]; total: number }>('listAuditEvents', {
      query: { limit },
    }),

  // --- Integrations -------------------------------------------------------
  listConnectors: (tenantId: string = TENANT) =>
    apiCall<{ connectors: ConnectorDto[] }>('listConnectors', { params: { tenantId } }),

  updateConnector: (connector: ConnectorDto, tenantId: string = TENANT) =>
    apiCall<ConnectorDto>('updateConnector', {
      params: { tenantId, connectorId: connector.id },
      body: connector,
    }),

  // --- Registry -----------------------------------------------------------
  getRegistryEntry: (flowName: string, tenantId: string = TENANT) =>
    apiCall<{
      flowName: string;
      versions: PublishedVersionDto[];
      environments: EnvironmentStateDto[];
    }>('getRegistryEntry', { params: { tenantId, flowName } }),

  listRegistryEvents: (
    filters: { flowName?: string; limit?: number } = {},
    tenantId: string = TENANT
  ) => apiCall<{ events: RegistryEventDto[] }>('listRegistryEvents', {
      params: { tenantId },
      query: filters,
    }),

  promoteVersion: (
    flowName: string,
    version: string,
    environment: string,
    tenantId: string = TENANT
  ) =>
    apiCall<EnvironmentStateDto>('promoteVersion', {
      params: { tenantId, flowName },
      body: { version, environment },
    }),

  rollbackVersion: (flowName: string, environment: string, tenantId: string = TENANT) =>
    apiCall<EnvironmentStateDto>('rollbackVersion', {
      params: { tenantId, flowName },
      body: { environment },
    }),

  /** Null stops the shadow. */
  setShadow: (
    flowName: string,
    version: string | null,
    environment: string,
    tenantId: string = TENANT
  ) =>
    apiCall<EnvironmentStateDto>('setShadow', {
      params: { tenantId, flowName },
      body: { version, environment },
    }),

  getShadowReport: (flowName: string, tenantId: string = TENANT) =>
    apiCall<ShadowReportDto>('getShadowReport', { params: { tenantId, flowName } }),

  // --- Flows ---------------------------------------------------------
  listArtifacts: (tenantId: string = TENANT) =>
    apiCall<{ artifacts: ArtifactSummaryDto[] }>('listArtifacts', { params: { tenantId } }),

  getArtifact: (artifactId: string, tenantId: string = TENANT) =>
    apiCall<ArtifactSummaryDto>('getArtifactSummary', {
      params: { tenantId, artifactId },
    }),
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
