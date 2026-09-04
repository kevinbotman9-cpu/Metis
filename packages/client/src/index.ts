/**
 * METIS API Client
 * GENERATED from OpenAPI spec
 *
 * Do not edit by hand. Regenerate via:
 *   npm run generate
 *
 * This file is a placeholder. The real client is generated from
 * the execution plane's OpenAPI specification.
 */

export interface ApiClient {
  artifacts: ArtifactService;
  decisions: DecisionService;
  approvals: ApprovalService;
  simulations: SimulationService;
}

export interface ArtifactService {
  // Artifact registry operations
  publishArtifact: (artifact: any) => Promise<any>;
  getArtifact: (id: string, version?: string) => Promise<any>;
  listVersions: (id: string) => Promise<any[]>;
  promoteVersion: (id: string, version: string, to: string) => Promise<any>;
  rollbackVersion: (id: string) => Promise<any>;
  getAuditLog: (id: string) => Promise<any[]>;
}

export interface DecisionService {
  // Decision execution and query
  searchDecisions: (query: any) => Promise<any>;
  getDecision: (id: string) => Promise<any>;
  getTrace: (id: string) => Promise<any>;
  replayDecision: (id: string, artifactVersion?: string) => Promise<any>;
}

export interface ApprovalService {
  // Change request workflow
  createChangeRequest: (request: any) => Promise<any>;
  getChangeRequest: (id: string) => Promise<any>;
  approveChangeRequest: (id: string) => Promise<any>;
  rejectChangeRequest: (id: string, reason: string) => Promise<any>;
}

export interface SimulationService {
  // Simulation and what-if analysis
  simulateStrategy: (artifact: any, population: any) => Promise<any>;
  getCounterfactual: (decisionId: string, targetOutcome: string) => Promise<any>;
}

export function createClient(_baseUrl: string, _token?: string): ApiClient {
  throw new Error(
    'Client not yet generated. Generate from OpenAPI spec via: npm run generate'
  );
}

export default {
  createClient,
};
