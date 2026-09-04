/**
 * METIS Trace UI
 * Renderers for DecisionTrace across five audiences:
 * - Customer: natural language reasons for the decision
 * - Business: business metrics and outcomes
 * - Analyst: detailed elimination cascade and scoring
 * - Engineer: full execution trace with timings
 * - Regulator: compliance-focused audit record
 */

import type { DecisionTrace } from '@metis/types';

export interface TraceRendererProps {
  trace: DecisionTrace;
  artifact?: any; // compiled artifact for context
  onNodeClick?: (nodeId: string) => void;
}

// Placeholder for the five renderers
export function renderForCustomer(_props: TraceRendererProps): React.ReactNode {
  return null; // TODO: Customer renderer
}

export function renderForBusiness(_props: TraceRendererProps): React.ReactNode {
  return null; // TODO: Business renderer
}

export function renderForAnalyst(_props: TraceRendererProps): React.ReactNode {
  return null; // TODO: Analyst renderer
}

export function renderForEngineer(_props: TraceRendererProps): React.ReactNode {
  return null; // TODO: Engineer renderer
}

export function renderForRegulator(_props: TraceRendererProps): React.ReactNode {
  return null; // TODO: Regulator renderer
}

export type TraceAudience = 'customer' | 'business' | 'analyst' | 'engineer' | 'regulator';

export function renderTrace(audience: TraceAudience, props: TraceRendererProps): React.ReactNode {
  switch (audience) {
    case 'customer':
      return renderForCustomer(props);
    case 'business':
      return renderForBusiness(props);
    case 'analyst':
      return renderForAnalyst(props);
    case 'engineer':
      return renderForEngineer(props);
    case 'regulator':
      return renderForRegulator(props);
  }
}
