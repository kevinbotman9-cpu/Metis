import { describe, it, expect } from 'vitest';
import { execute } from '../src/deterministic/engine';
import type {
  CatalogueSnapshot,
  DecisionRequest,
  ExecArtifact,
  MissingScoreDefault,
} from '../src/deterministic/types';
import type { Offer } from '@metis/core/domain';

/**
 * The approved default for a candidate nothing scored.
 *
 * §6 says a missing score must never become a silent zero, and asks for a
 * *configurable approved default* rather than a constant. The engine used a
 * hardcoded neutral 1.0. That is correct arithmetic — under exponentiation a
 * missing term is 1, not 0 — but it is a number nobody chose, and the
 * difference shows up the first time somebody asks why an unscored offer
 * outranked a scored one. "The engine assumes 1.0" is an implementation
 * detail. "The flow declares 0.3, approved by the risk committee on this
 * date" is an answer.
 */

const offer = (over: Partial<Offer> & { id: string; key: string }): Offer =>
  ({
    categoryId: 'g1',
    objectiveId: 'i1',
    name: over.id,
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
    creativeIds: ['t1'],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
    ...over,
  }) as Offer;

const catalogue: CatalogueSnapshot = {
  // Two offers whose margins differ, so a change to the shared propensity
  // moves every priority without changing their order — and a change to only
  // one candidate's score would.
  offers: [
    offer({ id: 'p1', key: 'offer_a' }),
    offer({
      id: 'p2',
      key: 'offer_b',
      financials: {
        price: { amount: 4000, currency: 'GBP' },
        cost: { amount: 400, currency: 'GBP' },
        expectedMargin: { amount: 3600, currency: 'GBP' },
        termMonths: 12,
        oneOff: false,
      },
    }),
  ],
  targetingPolicies: [],
  frequencyPolicies: [],
  arbitration: {
    id: 'arb',
    tenantId: 'telco-uk',
    weights: { propensity: 1, value: 1, boost: 1, context: 1 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'P x V x B x C',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
  },
  boosts: [],
  connectors: [],
} as unknown as CatalogueSnapshot;

/** No scoring node, so every candidate reaches arbitration unscored. */
const unscored = (missingScoreDefault?: MissingScoreDefault): ExecArtifact =>
  ({
    id: 'flow',
    version: '1.0.0',
    tenantId: 'telco-uk',
    candidateKeys: ['offer_a', 'offer_b'],
    packageVersions: { '@metis/nodes-core': '1.2.0' },
    nodes: [
      { id: 'source', type: 'source', label: 'Source' },
      { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate' },
    ],
    edges: [{ from: 'source', to: 'arbitrate' }],
    ...(missingScoreDefault ? { missingScoreDefault } : {}),
  }) as unknown as ExecArtifact;

const request: DecisionRequest = {
  tenantId: 'telco-uk',
  customerId: 'cust_1',
  channel: 'email',
  placement: 'weekly_offers',
  occurredAt: '2026-06-01T12:00:00.000Z',
  input: { age: 41 },
  consent: { marketing: true, profiling: true, thirdParty: false },
};

const APPROVED: MissingScoreDefault = {
  propensity: 0.3,
  context: 0.75,
  approvedBy: 'risk.committee@telco.example',
  approvedAt: '2026-05-01T09:00:00.000Z',
};

describe('a candidate nothing scored', () => {
  it('falls back to a neutral 1.0 when the flow declares no default', () => {
    const record = execute(unscored(), catalogue, request);
    const score = record.decision.scores.offer_a;

    // Neutral, not zero. Zero would eliminate every unscored candidate through
    // the arithmetic rather than through a policy, which is the silent failure
    // §6 names.
    expect(score.propensity).toBe(1);
    expect(score.context).toBe(1);
    expect(record.decision.arbitration.missingScore.approved).toBeNull();
  });

  it('uses the approved default when the flow declares one', () => {
    const record = execute(unscored(APPROVED), catalogue, request);
    const score = record.decision.scores.offer_a;

    expect(score.propensity).toBe(0.3);
    expect(score.context).toBe(0.75);
  });

  it('changes the outcome, which is the point of making it configurable', () => {
    const neutral = execute(unscored(), catalogue, request);
    const approved = execute(unscored(APPROVED), catalogue, request);

    // A configurable default that could not change a priority would be
    // decoration. Both decisions rank the same candidates; the numbers differ.
    expect(approved.decision.scores.offer_a.priority).not.toBe(
      neutral.decision.scores.offer_a.priority
    );
    expect(approved.chainHash).not.toBe(neutral.chainHash);
  });

  it('records which candidates fell back, and who approved the default', () => {
    const record = execute(unscored(APPROVED), catalogue, request);
    const missing = record.decision.arbitration.missingScore;

    // Sorted, so the record is stable run to run.
    expect(missing.applied).toEqual(['offer_a', 'offer_b']);
    expect(missing.approved).toEqual(APPROVED);
    // The approval is the part that makes this a default rather than a magic
    // number, so it has to survive into the record a regulator reads.
    expect(missing.approved?.approvedBy).toBe('risk.committee@telco.example');
  });

  it('records the default even when nothing needed it', () => {
    // Every candidate is eliminated before arbitration here, so nothing falls
    // back. The record still names the default, which is what keeps "no
    // default configured" distinguishable from "an older engine wrote this".
    const noCandidates = { ...unscored(APPROVED), candidateKeys: [] } as ExecArtifact;
    const record = execute(noCandidates, catalogue, request);

    expect(record.decision.arbitration.missingScore.applied).toEqual([]);
    expect(record.decision.arbitration.missingScore.approved).toEqual(APPROVED);
  });

  it('stays deterministic: the same default gives the same hash', () => {
    const a = execute(unscored(APPROVED), catalogue, request);
    const b = execute(unscored(APPROVED), catalogue, request);
    expect(b.chainHash).toBe(a.chainHash);
  });
});
