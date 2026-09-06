import { ArtifactRegistry, InMemoryRegistryStore, type RegistryStore } from '@metis/registry';
import { DecisionLedger, InMemoryLedgerStore, subjectHash } from '@metis/ledger';
import { execute } from '@metis/runtime/deterministic/engine';
import type {
  CatalogueSnapshot,
  DecisionRequest,
  ExecArtifact,
} from '@metis/runtime/deterministic/types';
import type { CompileContext, DecisionFlowSource } from '@metis/compiler/decision-flow';

/**
 * A populated tenant, built the way a real one is: published, promoted,
 * decided against, and given outcomes.
 *
 * Deliberately not a hand-written bundle. A round-trip test fed a literal
 * would prove the serialiser round-trips its own output and nothing about
 * whether an export describes a tenant.
 */

export const TENANT = 'telco-uk';
export const FLOW = 'inbound-web-offers';
const AT = '2026-06-01T12:00:00.000Z';

export function source(over: Partial<DecisionFlowSource> = {}): DecisionFlowSource {
  return {
    id: FLOW,
    version: '1.0.0',
    tenantId: TENANT,
    nodes: [
      { id: 'n1_source', type: 'source', label: 'Source', estimatedMs: 2 },
      { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
    ],
    edges: [{ from: 'n1_source', to: 'n2_arbitrate' }],
    candidateKeys: ['offer_a'],
    packageRanges: { '@metis/nodes-core': '^2.0.0' },
    ...over,
  } as DecisionFlowSource;
}

export function context(): CompileContext {
  return {
    offers: [offer()],
    targetingPolicies: [],
    frequencyPolicies: [],
    arbitration: arbitration(),
    availablePackages: { '@metis/nodes-core': ['2.0.0', '2.1.0'] },
    tenant: { id: TENANT, latencyBudgetMs: 50, maxNodes: 100 },
  } as CompileContext;
}

function offer() {
  return {
    id: 'p_a',
    categoryId: 'g1',
    objectiveId: 'i1',
    name: 'Offer A',
    key: 'offer_a',
    description: '',
    status: 'active',
    financials: {
      price: { amount: 1000, currency: 'GBP' },
      cost: { amount: 400, currency: 'GBP' },
      expectedMargin: { amount: 600, currency: 'GBP' },
      termMonths: 12,
      oneOff: false,
    },
    validity: { startsAt: '2020-01-01', endsAt: null },
    boost: 1,
    policyIds: [],
    creativeIds: ['t_a'],
    tags: [],
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'test',
  };
}

function arbitration() {
  return {
    id: 'arb',
    tenantId: TENANT,
    weights: { propensity: 1, value: 1, boost: 1, context: 1 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'P x V x B x C',
    updatedAt: AT,
    updatedBy: 'test',
  };
}

export const catalogue: CatalogueSnapshot = {
  offers: [offer()],
  targetingPolicies: [],
  frequencyPolicies: [],
  arbitration: arbitration(),
  boosts: [],
  connectors: [],
} as unknown as CatalogueSnapshot;

export const artifact: ExecArtifact = {
  id: FLOW,
  version: '1.0.0',
  tenantId: TENANT,
  candidateKeys: ['offer_a'],
  packageVersions: { '@metis/nodes-core': '2.0.0' },
  nodes: [
    { id: 'n1_source', type: 'source', label: 'Source' },
    { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
  ],
  edges: [{ from: 'n1_source', to: 'n2_arbitrate' }],
} as unknown as ExecArtifact;

export function request(customerId: string): DecisionRequest {
  return {
    tenantId: TENANT,
    customerId,
    channel: 'email',
    placement: 'weekly_offers',
    occurredAt: AT,
    input: { age: 41 },
    consent: { marketing: true, profiling: true, thirdParty: false },
  };
}

export interface Instance {
  registry: ArtifactRegistry;
  registryStore: RegistryStore;
  ledger: DecisionLedger;
}

export function emptyInstance(): Instance {
  const registryStore = new InMemoryRegistryStore();
  return {
    registryStore,
    registry: new ArtifactRegistry(registryStore),
    ledger: new DecisionLedger(new InMemoryLedgerStore()),
  };
}

/**
 * A tenant with history: two published versions, one promoted with the other
 * shadowing it, three decisions and two outcomes.
 *
 * The shadow matters here — it is the newest thing in the registry, and an
 * export written before it existed would silently drop it.
 */
export async function populatedInstance(): Promise<Instance> {
  const inst = emptyInstance();
  const ctx = context();

  await inst.registry.publish(
    { tenantId: TENANT, flowName: FLOW, version: '1.0.0', source: source(), actor: 'sarah', occurredAt: AT },
    ctx
  );
  await inst.registry.publish(
    {
      tenantId: TENANT,
      flowName: FLOW,
      version: '1.1.0',
      source: source({ version: '1.1.0', candidateKeys: ['offer_a'] }),
      actor: 'sarah',
      occurredAt: AT,
    },
    ctx
  );

  await inst.registry.promote(TENANT, FLOW, '1.0.0', 'production', 'marcus', AT);
  await inst.registry.startShadow(TENANT, FLOW, '1.1.0', 'production', 'marcus', AT);

  for (const id of ['cust_1', 'cust_2', 'cust_3']) {
    const req = request(id);
    const record = execute(artifact, catalogue, req);
    await inst.ledger.record({
      tenantId: TENANT,
      decisionId: record.id,
      subjectHash: subjectHash(TENANT, id),
      occurredAt: req.occurredAt,
      flowId: FLOW,
      flowVersion: '1.0.0',
      chainHash: record.chainHash,
      record,
    });
  }

  const [first] = await inst.ledger.query({ tenantId: TENANT });
  await inst.ledger.recordOutcome({
    tenantId: TENANT,
    decisionId: first.decisionId,
    type: 'impression',
    occurredAt: AT,
    valueMinor: null,
  });
  await inst.ledger.recordOutcome({
    tenantId: TENANT,
    decisionId: first.decisionId,
    type: 'acceptance',
    occurredAt: AT,
    valueMinor: 1000,
  });

  return inst;
}
