/**
 * METIS API Client
 * Typed client for the execution plane API
 * In development, this goes through MSW mocks
 * In production, this hits the real execution plane
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/api';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

async function apiCall<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const apiClient = {
  // Artifact Registry
  publishArtifact: (tenantId: string, strategyName: string, artifact: any) =>
    apiCall(`/artifacts/${tenantId}/${strategyName}`, {
      method: 'POST',
      body: artifact,
    }),

  getArtifact: (tenantId: string, strategyName: string, version?: string) =>
    apiCall(`/artifacts/${tenantId}/${strategyName}${version ? `?version=${version}` : ''}`),

  listVersions: (tenantId: string, strategyName: string) =>
    apiCall(`/artifacts/${tenantId}/${strategyName}/versions`),

  promoteVersion: (tenantId: string, strategyName: string, version: string) =>
    apiCall(`/artifacts/${tenantId}/${strategyName}/promote`, {
      method: 'POST',
      body: { version },
    }),

  rollbackVersion: (tenantId: string, strategyName: string) =>
    apiCall(`/artifacts/${tenantId}/${strategyName}/rollback`, { method: 'POST' }),

  getAuditLog: (tenantId: string, strategyName: string) =>
    apiCall(`/artifacts/${tenantId}/${strategyName}/audit`),

  // Decision Search & Trace
  searchDecisions: (query: {
    tenantId: string;
    dateFrom?: string;
    dateTo?: string;
    action?: string;
    limit?: number;
    cursor?: string;
  }) => apiCall('/decisions/search', { method: 'POST', body: query }),

  getDecisionTrace: (decisionId: string) =>
    apiCall(`/decisions/${decisionId}/trace`),

  replayDecision: (decisionId: string, artifactVersion?: string) =>
    apiCall(`/decisions/${decisionId}/replay`, {
      method: 'POST',
      body: { artifactVersion },
    }),

  // Change Requests
  createChangeRequest: (request: {
    artifactId: string;
    version: string;
    reason: string;
    proposedChanges: Record<string, any>;
  }) =>
    apiCall('/change-requests', {
      method: 'POST',
      body: request,
    }),

  getChangeRequest: (requestId: string) =>
    apiCall(`/change-requests/${requestId}`),

  approveChangeRequest: (requestId: string) =>
    apiCall(`/change-requests/${requestId}/approve`, { method: 'POST' }),

  rejectChangeRequest: (requestId: string, reason: string) =>
    apiCall(`/change-requests/${requestId}/reject`, {
      method: 'POST',
      body: { reason },
    }),

  // Simulation
  simulateStrategy: (query: {
    artifactId: string;
    version: string;
    populationSize?: number;
  }) =>
    apiCall('/simulations', {
      method: 'POST',
      body: query,
    }),

  // Counterfactuals
  getCounterfactual: (query: {
    decisionId: string;
    targetOutcome: string;
  }) =>
    apiCall('/counterfactuals', {
      method: 'POST',
      body: query,
    }),
};
