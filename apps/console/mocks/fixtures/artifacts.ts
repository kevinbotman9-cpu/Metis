/** Compiled strategy artifacts. Deterministic. */

const T0 = Date.parse('2026-09-01T09:00:00Z');
const iso = (h: number) => new Date(T0 + h * 3600_000).toISOString();

export interface ArtifactSummary {
  id: string;
  name: string;
  description: string;
  activeVersion: string;
  versions: string[];
  nodeCount: number;
  estimatedP95LatencyMs: number;
  status: 'active' | 'draft' | 'retired';
  /** Proposition keys this strategy can select from. */
  candidateKeys: string[];
  updatedAt: string;
  updatedBy: string;
}

export const artifacts: ArtifactSummary[] = [
  {
    id: 'next-best-action',
    name: 'Next Best Action',
    description:
      'The main arbitration strategy. Runs on every inbound and outbound touchpoint.',
    activeVersion: '2.4.0',
    versions: ['2.4.0', '2.3.1', '2.3.0', '2.2.0'],
    nodeCount: 5,
    estimatedP95LatencyMs: 11.4,
    status: 'active',
    candidateKeys: ['upsell_5g', 'upsell_data', 'retention_offer', 'addon_roaming'],
    updatedAt: iso(-12),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'inbound-web-offers',
    name: 'Inbound Web Offers',
    description: 'Lighter strategy for anonymous and logged-in web placements.',
    activeVersion: '1.8.2',
    versions: ['1.8.2', '1.8.1', '1.7.0'],
    nodeCount: 4,
    estimatedP95LatencyMs: 8.1,
    status: 'active',
    candidateKeys: ['acq_sim_30', 'acq_fibre_900', 'upsell_data'],
    updatedAt: iso(-96),
    updatedBy: 'sarah.chen@telco.example',
  },
  {
    id: 'retention-outbound',
    name: 'Retention Outbound Queue',
    description:
      'Builds the agent call queue for customers near contract end or with a PAC request.',
    activeVersion: '3.1.0',
    versions: ['3.1.0', '3.0.4'],
    nodeCount: 7,
    estimatedP95LatencyMs: 19.7,
    status: 'active',
    candidateKeys: ['retention_offer', 'winback_credit'],
    updatedAt: iso(-26),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'plan-fit-nudges',
    name: 'Plan Fit Nudges',
    description:
      'Service-led strategy that suggests a cheaper plan when usage is consistently low.',
    activeVersion: '0.4.0',
    versions: ['0.4.0'],
    nodeCount: 3,
    estimatedP95LatencyMs: 5.2,
    status: 'draft',
    candidateKeys: ['svc_plan_fit', 'svc_bill_shock'],
    updatedAt: iso(-2),
    updatedBy: 'priya.natarajan@telco.example',
  },
];
