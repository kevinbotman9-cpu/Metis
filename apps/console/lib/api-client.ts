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
  Denial as DenialDto,
  Elimination as EliminationDto,
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
  PolicySource as PolicySourceDto,
  InboundCall as InboundCallDto,
  Provenance as ProvenanceDto,
  ProfileSchema as ProfileSchemaDto,
  SchemaFieldPath as SchemaFieldPathDto,
  SchemaEntity as SchemaEntityDto,
  SchemaField as SchemaFieldDto,
  SchemaAggregation as SchemaAggregationDto,
  DataSource as DataSourceDto,
  PerformanceReport as PerformanceReportDto,
  PerformanceRow as PerformanceRowDto,
  ChannelStages as ChannelStagesDto,
  LoopDay as LoopDayDto,
  Experiment as ExperimentDto,
  ExperimentArm as ExperimentArmDto,
  ArmPerformance as ArmPerformanceDto,
  FieldMapping as FieldMappingDto,
  ValidationReport as ValidationReportDto,
  ColumnSummary as ColumnSummaryDto,
  Taxonomy as TaxonomyDto,
  Creative as CreativeDto,
  Placement as PlacementDto,
  DeliveryAttempt as DeliveryAttemptDto,
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

  // The taxonomy's two authoring operations. There is no `listObjectives` or
  // `listCategories`: `getTaxonomy` returns both, and the engine reads the
  // taxonomy as one snapshot, so a second way to read half of it would be a
  // second thing to keep in step.
  createObjective: (objective: Partial<ObjectiveDto>, tenantId: string = TENANT) =>
    apiCall<ObjectiveDto>('createObjective', { params: { tenantId }, body: objective }),

  updateObjective: (
    objectiveId: string,
    changes: Partial<ObjectiveDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<ObjectiveDto>('updateObjective', {
      params: { tenantId, objectiveId },
      body: changes,
    }),

  createCategory: (category: Partial<CategoryDto>, tenantId: string = TENANT) =>
    apiCall<CategoryDto>('createCategory', { params: { tenantId }, body: category }),

  updateCategory: (
    categoryId: string,
    changes: Partial<CategoryDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<CategoryDto>('updateCategory', {
      params: { tenantId, categoryId },
      body: changes,
    }),

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

  listAllCreatives: (
    filters: { channel?: string; active?: string; q?: string } = {},
    tenantId: string = TENANT
  ) =>
    apiCall<{ creatives: CreativeDto[]; total: number }>('listAllCreatives', {
      params: { tenantId },
      query: filters,
    }),

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

  createPlacement: (placement: Partial<PlacementDto>, tenantId: string = TENANT) =>
    apiCall<PlacementDto>('createPlacement', { params: { tenantId }, body: placement }),

  updatePlacement: (
    placementKey: string,
    changes: Partial<PlacementDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<PlacementDto>('updatePlacement', {
      params: { tenantId, placementKey },
      body: changes,
    }),

  /**
   * What the platform did about delivering one decision — ADR-013 §1.
   *
   * Separate from `getOutcomes` on purpose: an outcome is something the
   * customer did and a delivery is something the platform did.
   */
  listDeliveries: (decisionId: string, tenantId: string = TENANT) =>
    apiCall<{ deliveries: DeliveryAttemptDto[] }>('listDeliveries', {
      params: { tenantId, decisionId },
    }),

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
    apiCall<{ decisions: DecisionDto[]; total: number; provenance?: ProvenanceDto }>(
      'searchDecisions',
      {
        query: filters as Record<string, string | number | undefined>,
      }
    ),

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

  /**
   * Save a flow's graph and get the compiler's verdict on it.
   *
   * Saving does not change any decision: those run the version promoted to an
   * environment, so an edit reaches them through publish and promote.
   */
  updateDecisionFlowDraft: (
    artifactId: string,
    draft: {
      nodes?: ArtifactSummaryDto['nodes'];
      edges?: ArtifactSummaryDto['edges'];
      candidateKeys?: string[];
    },
    tenantId: string = TENANT
  ) =>
    apiCall<{ artifact: ArtifactSummaryDto; compile: CompileResultDto }>(
      'updateDecisionFlowDraft',
      { params: { tenantId, artifactId }, body: draft }
    ),

  // --- Intake -------------------------------------------------------------
  listDataSources: (tenantId: string = TENANT) =>
    apiCall<{ sources: DataSourceDto[] }>('listDataSources', { params: { tenantId } }),

  createDataSource: (
    source: { name: string; description?: string; kind: DataSourceDto['kind'] },
    tenantId: string = TENANT
  ) => apiCall<DataSourceDto>('createDataSource', { params: { tenantId }, body: source }),

  updateDataSource: (
    sourceId: string,
    patch: { name?: string; description?: string; mappings?: FieldMappingDto[] },
    tenantId: string = TENANT
  ) => apiCall<DataSourceDto>('updateDataSource', { params: { tenantId, sourceId }, body: patch }),

  landRows: (
    sourceId: string,
    rows: Record<string, unknown>[],
    replace = false,
    tenantId: string = TENANT
  ) => apiCall<DataSourceDto>('landRows', { params: { tenantId, sourceId }, body: { rows, replace } }),

  validateDataSource: (sourceId: string, tenantId: string = TENANT) =>
    apiCall<{ source: DataSourceDto; report: ValidationReportDto }>('validateDataSource', {
      params: { tenantId, sourceId },
    }),

  activateDataSource: (sourceId: string, tenantId: string = TENANT) =>
    apiCall<DataSourceDto>('activateDataSource', { params: { tenantId, sourceId } }),

  // --- Experiments --------------------------------------------------------
  listExperiments: (tenantId: string = TENANT) =>
    apiCall<{ experiments: ExperimentDto[] }>('listExperiments', { params: { tenantId } }),

  createExperiment: (
    experiment: Pick<ExperimentDto, 'key' | 'name' | 'description' | 'arms'>,
    tenantId: string = TENANT
  ) => apiCall<ExperimentDto>('createExperiment', { params: { tenantId }, body: experiment }),

  updateExperiment: (
    experimentId: string,
    patch: Partial<ExperimentDto>,
    tenantId: string = TENANT
  ) =>
    apiCall<ExperimentDto>('updateExperiment', {
      params: { tenantId, experimentId },
      body: patch,
    }),

  // --- Measurement --------------------------------------------------------
  /** Outcomes joined to the decisions they belong to. Counting, not modelling. */
  getPerformance: (
    filters: { flowId?: string; channel?: string; limit?: number } = {},
    tenantId: string = TENANT
  ) => apiCall<PerformanceReportDto>('getPerformance', { params: { tenantId }, query: filters }),

  // --- Data model ---------------------------------------------------------
  /**
   * The tenant's data model, and the paths a policy may reference.
   *
   * `paths` comes from the server rather than being derived here, so the
   * editor and the compiler cannot offer different operator sets.
   */
  getProfileSchema: (tenantId: string = TENANT) =>
    apiCall<{ schema: ProfileSchemaDto; paths: SchemaFieldPathDto[]; problems?: string[] }>(
      'getProfileSchema',
      { params: { tenantId } }
    ),

  createTargetingPolicy: (
    policy: Omit<TargetingPolicyDto, 'id' | 'createdAt' | 'updatedAt'>,
    tenantId: string = TENANT
  ) =>
    apiCall<TargetingPolicyDto>('createTargetingPolicy', {
      params: { tenantId },
      body: policy,
    }),

  updateTargetingPolicy: (policy: TargetingPolicyDto, tenantId: string = TENANT) =>
    apiCall<TargetingPolicyDto>('updateTargetingPolicy', {
      params: { tenantId, policyId: policy.id },
      body: policy,
    }),

  /** Traffic served by the API — the inbound half of integration. */
  listInboundCalls: (limit = 100) =>
    apiCall<{ enabled: boolean; calls: InboundCallDto[] }>('listInboundCalls', {
      query: { limit },
    }),

  clearInboundCalls: () => apiCall<{ cleared: boolean }>('clearInboundCalls', {}),

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
  DenialDto,
  EliminationDto,
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
  PlacementDto,
  DeliveryAttemptDto,
  ConnectorDto,
  PublishedVersionDto,
  EnvironmentStateDto,
  PublishOutcomeDto,
  RegistryEventDto,
  SourceBindingDto,
  SourceCallDto,
  PolicySourceDto,
  InboundCallDto,
  ProfileSchemaDto,
  SchemaFieldPathDto,
  SchemaEntityDto,
  SchemaFieldDto,
  SchemaAggregationDto,
  DataSourceDto,
  PerformanceReportDto,
  PerformanceRowDto,
  ChannelStagesDto,
  LoopDayDto,
  ExperimentDto,
  ExperimentArmDto,
  ArmPerformanceDto,
  FieldMappingDto,
  ValidationReportDto,
  ColumnSummaryDto,
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
