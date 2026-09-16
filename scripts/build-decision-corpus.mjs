#!/usr/bin/env node
/**
 * Build the decision-level conformance corpus.
 *
 * Run: npm run corpus:decisions
 *
 * The value corpus (canonical-corpus.json) proves two implementations agree on
 * how to serialise and hash a value. This one proves they agree on what a
 * decision *is*: given the same artifact, catalogue and request, both engines
 * must produce the same eliminations, the same scores, the same winner, and
 * therefore the same chain hash.
 *
 * That is what turns a second engine from a rewrite into a bounded piece of
 * work. There is an objective finish line, and it is this file.
 *
 * Cases are chosen for the rules a reimplementation would get wrong: tie-breaks,
 * scope resolution, the neutral-score rule, frequency policy scoping, the
 * service-exemption threshold, and the float behaviour in `round` and `pow`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../packages/runtime/src/deterministic/engine.ts';
import { hash } from '../packages/runtime/src/deterministic/canonical.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Building blocks --------------------------------------------------------

const money = (amount) => ({ amount, currency: 'GBP' });

function offer(over = {}) {
  const id = over.id ?? 'p_a';
  return {
    id,
    categoryId: 'grp_1',
    objectiveId: 'iss_1',
    name: `Offer ${id}`,
    key: over.key ?? id,
    description: 'Fixture offer.',
    status: 'active',
    financials: {
      price: money(3500),
      cost: money(1200),
      expectedMargin: money(2300),
      termMonths: 24,
      oneOff: false,
    },
    validity: { startsAt: '2020-01-01', endsAt: null },
    boost: 1,
    policyIds: [],
    creativeIds: [],
    tags: [],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    updatedBy: 'fixture',
    ...over,
  };
}

function policy(over = {}) {
  return {
    id: 'pol_1',
    name: 'Fixture policy',
    kind: 'eligibility',
    description: 'Fixture.',
    conditions: [{ field: 'tenureMonths', operator: 'gte', value: 12 }],
    scope: { level: 'tenant', targetId: null },
    active: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

function frequencyPolicy(over = {}) {
  return {
    id: 'cp_1',
    name: 'Fixture cap',
    description: 'Fixture.',
    channel: null,
    maxContacts: 3,
    period: 'week',
    cooldownDaysAfterReject: 0,
    scope: { level: 'tenant', targetId: null },
    active: true,
    ...over,
  };
}

function catalogue(over = {}) {
  return {
    offers: [offer({ id: 'p_a', key: 'offer_a' })],
    targetingPolicies: [],
    frequencyPolicies: [],
    arbitration: {
      id: 'arb',
      tenantId: 't',
      weights: { propensity: 1, value: 1, boost: 1, context: 1 },
      utility: { id: 'multiplicative', version: '1.0.0' },
      formula: 'P^wP x V^wV x B^wB x C^wC',
      updatedAt: '2020-01-01T00:00:00.000Z',
      updatedBy: 'fixture',
    },
    boosts: [],
    connectors: [],
    ...over,
  };
}

function artifact(over = {}) {
  return {
    id: 'art_fixture',
    version: '1.0.0',
    tenantId: 't',
    nodes: [
      { id: 'n1_source', type: 'source', label: 'Source' },
      { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
    ],
    edges: [{ from: 'n1_source', to: 'n3_arbitrate' }],
    candidateKeys: ['offer_a'],
    packageVersions: { '@metis/nodes-core': '2.0.0' },
    ...over,
  };
}

/**
 * Consent stated, because a caller has to state it. Until 2026-09-13 this helper
 * sent none, and 31 of the cases were therefore decided on consent both engines
 * invented (G-065). They test ranking, scope and caps, not consent, so they state
 * a grant; the consent cases below state or omit it on purpose.
 */
const GRANTED = { marketing: true, profiling: true, thirdParty: false };

function request(over = {}) {
  return {
    tenantId: 't',
    customerId: 'cust_1',
    channel: 'web',
    placement: 'hero',
    occurredAt: '2026-06-01T12:00:00.000Z',
    input: { tenureMonths: 24 },
    consent: GRANTED,
    ...over,
  };
}

/**
 * One commercial scope and one duty-of-care scope, for the consent cases: what
 * survives withheld, absent and partly stated consent is the service offer.
 */
const consentScenario = () => ({
  artifact: artifact({
    candidateKeys: threeKeys,
    nodes: [
      { id: 'n1_source', type: 'source', label: 'Source' },
      { id: 'n2_constraint', type: 'constraint', label: 'Frequency policy', frequencyPolicyIds: ['cp_1'] },
      { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
    ],
    edges: [
      { from: 'n1_source', to: 'n2_constraint' },
      { from: 'n2_constraint', to: 'n3_arbitrate' },
    ],
  }),
  catalogue: catalogue({
    offers: [
      offer({ id: 'p_a', key: 'offer_a', categoryId: 'grp_svc' }),
      offer({ id: 'p_b', key: 'offer_b', categoryId: 'grp_2' }),
      offer({ id: 'p_c', key: 'offer_c', categoryId: 'grp_2' }),
    ],
    frequencyPolicies: [
      // A cap this high is a scope declaring itself exempt, which is how a
      // duty-of-care message stays deliverable when commercial offers stop.
      frequencyPolicy({ id: 'cp_svc', maxContacts: 100, scope: { level: 'category', targetId: 'grp_svc' } }),
      frequencyPolicy({ id: 'cp_com', maxContacts: 3, scope: { level: 'category', targetId: 'grp_2' } }),
    ],
  }),
});

const scoreNode = { id: 'n2_score', type: 'score-model', label: 'Propensity', model: { id: 'm_prop', version: '3.1.0' } };

/** Source -> score -> arbitrate, the shape most flows take. */
function scoredArtifact(over = {}) {
  return artifact({
    nodes: [
      { id: 'n1_source', type: 'source', label: 'Source' },
      scoreNode,
      { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
    ],
    edges: [
      { from: 'n1_source', to: 'n2_score' },
      { from: 'n2_score', to: 'n3_arbitrate' },
    ],
    ...over,
  });
}

// --- Cases ------------------------------------------------------------------

const three = [
  offer({ id: 'p_a', key: 'offer_a', boost: 1.25 }),
  offer({ id: 'p_b', key: 'offer_b', boost: 0.8 }),
  offer({ id: 'p_c', key: 'offer_c', boost: 1 }),
];
const threeKeys = ['offer_a', 'offer_b', 'offer_c'];

const CASES = [
  {
    name: 'single candidate, no policies',
    artifact: artifact(),
    catalogue: catalogue(),
    request: request(),
  },
  {
    name: 'scored and arbitrated',
    artifact: scoredArtifact({ candidateKeys: threeKeys }),
    catalogue: catalogue({ offers: three }),
    request: request(),
  },
  {
    name: 'no score node: every term neutral except value and boost',
    // The rule a reimplementation is most likely to get wrong. A candidate with
    // no model score is not disqualified; the missing terms are 1.0, not 0.
    artifact: artifact({ candidateKeys: threeKeys }),
    catalogue: catalogue({ offers: three }),
    request: request(),
  },
  {
    name: 'approved default stands in for a missing score',
    // §6 asks for a configurable approved default rather than a constant. The
    // case above proves the neutral 1.0 fallback; this proves a flow can
    // declare something else, that it reaches the score, and that the record
    // names who approved it. A second engine that ignored the field would
    // still produce a plausible decision, and a different hash.
    artifact: artifact({
      candidateKeys: threeKeys,
      missingScoreDefault: {
        propensity: 0.3,
        context: 0.75,
        approvedBy: 'risk.committee@telco.example',
        approvedAt: '2026-05-01T09:00:00.000Z',
      },
    }),
    catalogue: catalogue({ offers: three }),
    request: request(),
  },
  {
    name: 'an approved default is recorded even when nothing needed it',
    // Every candidate is scored here, so `applied` is empty and `approved` is
    // still the declared default. The record states what would have happened,
    // which is what makes "no default configured" distinguishable from "an
    // older engine wrote this".
    artifact: scoredArtifact({
      candidateKeys: threeKeys,
      missingScoreDefault: {
        propensity: 0.3,
        context: 0.75,
        approvedBy: 'risk.committee@telco.example',
        approvedAt: '2026-05-01T09:00:00.000Z',
      },
    }),
    catalogue: catalogue({ offers: three }),
    request: request(),
  },
  {
    name: 'non-unit arbitration weights exercise pow',
    // Math.pow is not required to be correctly rounded in either runtime, so
    // this is where an ulp of difference would show up as a different hash.
    artifact: scoredArtifact({ candidateKeys: threeKeys }),
    catalogue: catalogue({
      offers: three,
      arbitration: {
        id: 'arb',
        tenantId: 't',
        weights: { propensity: 1.5, value: 0.75, boost: 2, context: 0.3333333333333333 },
        utility: { id: 'multiplicative', version: '1.0.0' },
        formula: 'P^wP x V^wV x B^wB x C^wC',
        updatedAt: '2020-01-01T00:00:00.000Z',
        updatedBy: 'fixture',
      },
    }),
    request: request(),
  },
  {
    name: 'tie on priority breaks by the order the flow declared',
    // Two identical offers differing only in key. Sort stability is not
    // guaranteed across languages, so the engine breaks ties explicitly.
    //
    // It broke by key until ADR-019 §8, which is why the keys here are `z`
    // before `a`: the winner was `offer_a` on the strength of its name, and a
    // rename could hand the decision to the other one. The tie-break is the
    // artifact's declared order now, so `offer_z` wins by being named first,
    // and this case is what holds both engines to it.
    artifact: artifact({ candidateKeys: ['offer_z', 'offer_a'] }),
    catalogue: catalogue({
      offers: [
        offer({ id: 'p_z', key: 'offer_z' }),
        offer({ id: 'p_a2', key: 'offer_a' }),
      ],
    }),
    request: request(),
  },
  {
    // A second ranking function, so the corpus proves the evaluator and not
    // just one hard-coded expression. Without this the `expected-value` AST
    // would be exercised by unit tests on one engine and by nothing at all on
    // the other.
    name: 'expected-value ranking function instead of multiplicative',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_score', type: 'score-adaptive', label: 'Score', model: { id: 'm', version: '1.0.0' } },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_score' },
        { from: 'n2_score', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: three,
      arbitration: {
        id: 'arb_ev',
        tenantId: 't',
        weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
        utility: { id: 'expected-value', version: '1.0.0' },
        formula: '(P x V - Cost) x B',
        updatedAt: '2020-01-01T00:00:00.000Z',
        updatedBy: 'fixture',
      },
    }),
    request: request(),
  },
  {
    // The three qualification tiers each carry their own reason code, and a
    // second engine can get one right and another wrong. Without a case per
    // tier the corpus would only prove ELIGIBILITY_FAILED, and RELEVANCE_FAILED
    // and SUITABILITY_FAILED would ship unverified.
    name: 'relevance filter removes a candidate',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Relevance', policyIds: ['pol_recent'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: three,
      targetingPolicies: [
        policy({
          id: 'pol_recent',
          kind: 'relevance',
          conditions: [{ field: 'daysSinceContact', operator: 'gte', value: 30 }],
        }),
      ],
    }),
    request: request({ input: { daysSinceContact: 3 } }),
  },
  {
    name: 'suitability constraint removes a candidate',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Suitability', policyIds: ['pol_afford'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: three,
      targetingPolicies: [
        policy({
          id: 'pol_afford',
          kind: 'suitability',
          conditions: [{ field: 'billToIncome', operator: 'lte', value: 0.08 }],
        }),
      ],
    }),
    request: request({ input: { billToIncome: 0.19 } }),
  },
  {
    name: 'eligibility filter removes a candidate',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_tenure'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: three,
      targetingPolicies: [
        policy({ id: 'pol_tenure', conditions: [{ field: 'tenureMonths', operator: 'gte', value: 36 }] }),
      ],
    }),
    request: request({ input: { tenureMonths: 24 } }),
  },
  {
    name: 'policy scoped to a category only applies to that category',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_grp'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: [
        offer({ id: 'p_a', key: 'offer_a', categoryId: 'grp_1' }),
        offer({ id: 'p_b', key: 'offer_b', categoryId: 'grp_2' }),
        offer({ id: 'p_c', key: 'offer_c', categoryId: 'grp_2' }),
      ],
      targetingPolicies: [
        policy({
          id: 'pol_grp',
          scope: { level: 'category', targetId: 'grp_2' },
          conditions: [{ field: 'tenureMonths', operator: 'gte', value: 999 }],
        }),
      ],
    }),
    request: request(),
  },
  {
    name: 'missing field fails a numeric comparison rather than passing it',
    artifact: artifact({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_missing'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      targetingPolicies: [
        policy({ id: 'pol_missing', conditions: [{ field: 'notPresent', operator: 'gte', value: 1 }] }),
      ],
    }),
    request: request({ input: {} }),
  },
  {
    name: 'every comparison operator',
    artifact: artifact({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_ops'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      targetingPolicies: [
        policy({
          id: 'pol_ops',
          conditions: [
            { field: 'present', operator: 'exists', value: null },
            { field: 'absent', operator: 'not_exists', value: null },
            { field: 'segment', operator: 'eq', value: 'premium' },
            { field: 'segment', operator: 'ne', value: 'budget' },
            { field: 'segment', operator: 'in', value: ['premium', 'standard'] },
            { field: 'segment', operator: 'not_in', value: ['churned'] },
            { field: 'plan', operator: 'contains', value: '5g' },
            { field: 'tags', operator: 'contains', value: 'vip' },
            { field: 'tenureMonths', operator: 'gt', value: 5 },
            { field: 'tenureMonths', operator: 'gte', value: 24 },
            { field: 'tenureMonths', operator: 'lt', value: 99 },
            { field: 'tenureMonths', operator: 'lte', value: 24 },
            { field: 'nested.deep.value', operator: 'eq', value: 7 },
          ],
        }),
      ],
    }),
    request: request({
      input: {
        present: 'yes',
        segment: 'premium',
        plan: 'plan_5g_unlimited',
        tags: ['vip', 'early'],
        tenureMonths: 24,
        nested: { deep: { value: 7 } },
      },
    }),
  },
  {
    name: 'frequency policy breach suppresses',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_constraint', type: 'constraint', label: 'Frequency policy', frequencyPolicyIds: ['cp_1'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_constraint' },
        { from: 'n2_constraint', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({ offers: three, frequencyPolicies: [frequencyPolicy()] }),
    request: request({ contactHistory: { channel: 'web', withinPeriod: { week: 5 } } }),
  },
  {
    // G-086. The cooldown was declared on every catalogue and enforced by
    // neither engine; these three cases are what stops that returning, because
    // the Kotlin engine has to produce the same denial for the same input.
    //
    // Per-offer on purpose: the decline suppresses the offer that was declined,
    // and the policy's scope says which offers carry the rest period. Read the
    // other way, one "no" would silence every candidate a tenant-scoped policy
    // covers — which is what `offer_b` and `offer_c` are here to prove it does
    // not do.
    name: 'a decline inside the rest period suppresses that offer and no other',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_constraint', type: 'constraint', label: 'Frequency policy', frequencyPolicyIds: ['cp_1'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_constraint' },
        { from: 'n2_constraint', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: three,
      frequencyPolicies: [frequencyPolicy({ cooldownDaysAfterReject: 30 })],
    }),
    request: request({
      contactHistory: {
        channel: 'web',
        withinPeriod: { week: 0 },
        // Five days before the decision. The cap is nowhere near breached, so
        // a suppression here can only be the cooldown.
        rejects: { offer_a: '2026-05-27T12:00:00.000Z' },
      },
    }),
  },
  {
    name: 'a decline older than the rest period does not suppress',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_constraint', type: 'constraint', label: 'Frequency policy', frequencyPolicyIds: ['cp_1'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_constraint' },
        { from: 'n2_constraint', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: three,
      frequencyPolicies: [frequencyPolicy({ cooldownDaysAfterReject: 30 })],
    }),
    request: request({
      contactHistory: {
        channel: 'web',
        withinPeriod: { week: 0 },
        // Thirty-one days. The window is closed and the offer is back.
        rejects: { offer_a: '2026-05-01T12:00:00.000Z' },
      },
    }),
  },
  {
    // Both reasons are true at once. Which one the customer is told is a fact
    // about the platform, so it is pinned rather than left to whichever engine
    // evaluated first.
    name: 'a breached cap is reported ahead of an active cooldown',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_constraint', type: 'constraint', label: 'Frequency policy', frequencyPolicyIds: ['cp_1'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_constraint' },
        { from: 'n2_constraint', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: three,
      frequencyPolicies: [frequencyPolicy({ cooldownDaysAfterReject: 30 })],
    }),
    request: request({
      contactHistory: {
        channel: 'web',
        withinPeriod: { week: 5 },
        rejects: { offer_a: '2026-05-27T12:00:00.000Z' },
      },
    }),
  },
  {
    name: 'frequency policy scoped to a category leaves the rest alone',
    // The defect this case exists for: applying every frequency policy to every
    // candidate once suppressed an entire catalogue.
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_constraint', type: 'constraint', label: 'Frequency policy', frequencyPolicyIds: ['cp_grp'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_constraint' },
        { from: 'n2_constraint', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: [
        offer({ id: 'p_a', key: 'offer_a', categoryId: 'grp_1' }),
        offer({ id: 'p_b', key: 'offer_b', categoryId: 'grp_2' }),
        offer({ id: 'p_c', key: 'offer_c', categoryId: 'grp_2' }),
      ],
      frequencyPolicies: [
        frequencyPolicy({ id: 'cp_grp', maxContacts: 1, scope: { level: 'category', targetId: 'grp_2' } }),
      ],
    }),
    request: request({ contactHistory: { channel: 'web', withinPeriod: { week: 2 } } }),
  },
  {
    name: 'withheld consent leaves only service-exempt scopes',
    ...consentScenario(),
    request: request({
      consent: { marketing: false, profiling: true, thirdParty: false },
    }),
  },
  {
    // G-065. The request states no consent at all. Both engines once read that
    // as marketing granted and recorded it under the chain hash as though the
    // customer had given it. Absent is enforced as withheld — only the
    // duty-of-care offer survives — and recorded as absent, not as a no.
    name: 'absent consent is enforced as withheld and recorded as absent',
    ...consentScenario(),
    request: request({ consent: undefined }),
  },
  {
    // A caller that states some purposes and leaves marketing out has not
    // granted marketing. The Kotlin service once read a missing field as true.
    name: 'a purpose left out of stated consent is absent, not granted',
    ...consentScenario(),
    request: request({ consent: { profiling: true, thirdParty: false } }),
  },
  {
    name: 'channel-specific frequency policy ignores other channels',
    artifact: artifact({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_constraint', type: 'constraint', label: 'Frequency policy', frequencyPolicyIds: ['cp_sms'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_constraint' },
        { from: 'n2_constraint', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      frequencyPolicies: [frequencyPolicy({ id: 'cp_sms', channel: 'sms', maxContacts: 0 })],
    }),
    request: request({ channel: 'web', contactHistory: { channel: 'web', withinPeriod: { week: 9 } } }),
  },
  {
    name: 'boost resolves to the most specific scope',
    artifact: scoredArtifact({ candidateKeys: threeKeys }),
    catalogue: catalogue({
      offers: three,
      boosts: [
        { id: 'lv_t', name: 'Tenant', scope: { level: 'tenant', targetId: null }, value: 1.1, reason: 'x', validity: null, updatedAt: '2020-01-01T00:00:00.000Z', updatedBy: 'f' },
        { id: 'lv_g', name: 'Category', scope: { level: 'category', targetId: 'grp_1' }, value: 1.4, reason: 'x', validity: null, updatedAt: '2020-01-01T00:00:00.000Z', updatedBy: 'f' },
        { id: 'lv_p', name: 'Offer', scope: { level: 'offer', targetId: 'p_b' }, value: 2.5, reason: 'x', validity: null, updatedAt: '2020-01-01T00:00:00.000Z', updatedBy: 'f' },
      ],
    }),
    request: request(),
  },
  {
    name: 'boost outside its validity window does not apply',
    artifact: scoredArtifact(),
    catalogue: catalogue({
      boosts: [
        {
          id: 'lv_expired',
          name: 'Expired',
          scope: { level: 'tenant', targetId: null },
          value: 9,
          reason: 'x',
          validity: { startsAt: '2020-01-01', endsAt: '2020-12-31' },
          updatedAt: '2020-01-01T00:00:00.000Z',
          updatedBy: 'f',
        },
      ],
    }),
    request: request(),
  },
  {
    name: 'retired and out-of-window candidates never enter',
    artifact: artifact({ candidateKeys: ['offer_a', 'offer_retired', 'offer_future'] }),
    catalogue: catalogue({
      offers: [
        offer({ id: 'p_a', key: 'offer_a' }),
        offer({ id: 'p_r', key: 'offer_retired', status: 'retired' }),
        offer({ id: 'p_f', key: 'offer_future', validity: { startsAt: '2030-01-01', endsAt: null } }),
      ],
    }),
    request: request(),
  },
  {
    name: 'no candidates survive: no offer',
    artifact: artifact({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_never'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      targetingPolicies: [
        policy({ id: 'pol_never', conditions: [{ field: 'tenureMonths', operator: 'gte', value: 9999 }] }),
      ],
    }),
    request: request(),
  },
  {
    name: 'connector provenance is recorded, not fetched',
    artifact: artifact({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source', connectorIds: ['conn_a', 'conn_off'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
    }),
    catalogue: catalogue({
      connectors: [
        {
          id: 'conn_a',
          name: 'Feature store',
          kind: 'feature-store',
          description: 'Fixture.',
          target: 'featurestore://t',
          declaredP95Ms: 4,
          timeoutMs: 25,
          onFailure: 'fail',
          cacheTtlSeconds: 300,
          provides: [
            { field: 'tenureMonths', path: 'account.tenure', type: 'number' },
            { field: 'notInInput', path: 'account.missing', type: 'number' },
          ],
          active: true,
          updatedAt: '2020-01-01T00:00:00.000Z',
          updatedBy: 'f',
        },
        {
          id: 'conn_off',
          name: 'Inactive',
          kind: 'rest',
          description: 'Fixture.',
          target: 'https://x',
          declaredP95Ms: 10,
          timeoutMs: 50,
          onFailure: 'omit',
          cacheTtlSeconds: 0,
          provides: [{ field: 'tenureMonths', path: 'a.b', type: 'number' }],
          active: false,
          updatedAt: '2020-01-01T00:00:00.000Z',
          updatedBy: 'f',
        },
      ],
    }),
    request: request(),
  },
  {
    name: 'node visit order is topological with ties broken by id',
    // Two independent roots and a diamond, authored out of order.
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'z_annotate', type: 'explain-annotate', label: 'Annotate' },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
        { id: 'a_switch', type: 'switch', label: 'Switch' },
        { id: 'n1_source', type: 'source', label: 'Source' },
      ],
      edges: [
        { from: 'n1_source', to: 'a_switch' },
        { from: 'n1_source', to: 'z_annotate' },
        { from: 'a_switch', to: 'n3_arbitrate' },
        { from: 'z_annotate', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({ offers: three }),
    request: request(),
  },
  {
    name: 'an offer-scoped policy only binds where the candidate opted in',
    artifact: artifact({
      candidateKeys: ['offer_a', 'offer_b'],
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_opt'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: [
        offer({ id: 'p_a', key: 'offer_a', policyIds: ['pol_opt'] }),
        offer({ id: 'p_b', key: 'offer_b', policyIds: [] }),
      ],
      targetingPolicies: [
        policy({
          id: 'pol_opt',
          scope: { level: 'offer', targetId: 'p_a' },
          conditions: [{ field: 'tenureMonths', operator: 'gte', value: 9999 }],
        }),
      ],
    }),
    request: request(),
  },
  {
    name: 'inactive policy is ignored',
    artifact: artifact({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_off'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      targetingPolicies: [
        policy({ id: 'pol_off', active: false, conditions: [{ field: 'tenureMonths', operator: 'gte', value: 9999 }] }),
      ],
    }),
    request: request(),
  },
  {
    name: 'expectedMargin drives the value term, floored at 0.01',
    artifact: scoredArtifact({ candidateKeys: ['offer_rich', 'offer_zero'] }),
    catalogue: catalogue({
      offers: [
        offer({
          id: 'p_rich',
          key: 'offer_rich',
          financials: { price: money(90000), cost: money(1000), expectedMargin: money(89000), termMonths: 24, oneOff: false },
        }),
        offer({
          id: 'p_zero',
          key: 'offer_zero',
          financials: { price: money(100), cost: money(100), expectedMargin: money(0), termMonths: 1, oneOff: true },
        }),
      ],
    }),
    request: request(),
  },
  {
    // The case that would have caught it. Both engines derived source bindings
    // by asking whether the input had a *key* named after the connector's
    // field — `field in input` in TypeScript, `containsKey` in Kotlin — which
    // is true only when the field has no dots in it. The case above declares
    // `tenureMonths`, so it passed while every nested binding was dropped and
    // the trace attributed nothing (G-069). This one declares a path.
    name: 'a connector supplies a value nested under the profile root',
    artifact: artifact({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source', connectorIds: ['conn_bureau'] },
        {
          id: 'n2_filter',
          type: 'filter',
          label: 'Eligibility',
          policyIds: ['pol_band'],
        },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      connectors: [
        {
          id: 'conn_bureau',
          name: 'Credit bureau',
          kind: 'rest',
          description: 'Fixture.',
          target: 'https://bureau.example',
          declaredP95Ms: 12,
          timeoutMs: 60,
          onFailure: 'fail',
          cacheTtlSeconds: 600,
          provides: [{ field: 'customer.credit_band', path: 'file.band', type: 'string' }],
          active: true,
          updatedAt: '2020-01-01T00:00:00.000Z',
          updatedBy: 'f',
        },
      ],
      targetingPolicies: [
        policy({
          id: 'pol_band',
          conditions: [{ field: 'customer.credit_band', operator: 'in', value: ['A', 'B'] }],
        }),
      ],
    }),
    request: request({ input: { customer: { credit_band: 'A' } } }),
  },
  {
    // The data model the flow compiled against, carried into the decision.
    // ADR-014 §2. Every other case pins none and records `schema: null`, so
    // this one is what proves the two engines agree on a pin that is present:
    // an absent key and a null one hash differently, and so do two engines
    // that disagree about which they wrote.
    name: 'a pinned schema is part of the decision',
    artifact: artifact({
      schema: { id: 'schema_fixture', version: '3.1.0', hash: 'a'.repeat(64) },
    }),
    catalogue: catalogue(),
    request: request(),
  },
  {
    // G-015. A flow with no constraint node once decided without consent: the
    // engine checked it only at constraint nodes, so omitting the node type
    // omitted enforcement. The platform applies it before ranking instead, and
    // records the step as its own.
    name: 'consent is applied to a flow with no constraint node',
    artifact: artifact({ candidateKeys: threeKeys }),
    catalogue: consentScenario().catalogue,
    request: request({ consent: { marketing: false, profiling: true, thirdParty: false } }),
  },
  {
    name: 'absent consent is applied to a flow with no constraint node',
    artifact: artifact({ candidateKeys: threeKeys }),
    catalogue: consentScenario().catalogue,
    request: request({ consent: undefined }),
  },
  {
    // A constraint node after ranking checks consent too late to stop the
    // winner. Consent is applied before ranking whatever comes after it.
    name: 'a constraint node after ranking does not stand in for consent',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
        { id: 'n4_constraint', type: 'constraint', label: 'Frequency policy' },
      ],
      edges: [
        { from: 'n1_source', to: 'n3_arbitrate' },
        { from: 'n3_arbitrate', to: 'n4_constraint' },
      ],
    }),
    catalogue: consentScenario().catalogue,
    request: request({ consent: { marketing: false, profiling: true, thirdParty: false } }),
  },
  {
    // G-075, ADR-017. The case the language could not express: whether an offer
    // lowers *this* customer's bill. One suitability policy, one decision, two
    // retention offers; the offer that would raise the bill is refused and the
    // one that would lower it survives. Before ADR-017 a policy saw only the
    // request, so both passed or both failed together.
    name: 'a condition compares each candidate with the customer, and splits the decision',
    artifact: artifact({
      candidateKeys: ['offer_lower', 'offer_higher'],
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Suitability', policyIds: ['pol_lowers_bill'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: [
        offer({
          id: 'p_lower',
          key: 'offer_lower',
          financials: { price: money(2500), cost: money(900), expectedMargin: money(1600), termMonths: 12, oneOff: false },
        }),
        offer({
          id: 'p_higher',
          key: 'offer_higher',
          financials: { price: money(4500), cost: money(1500), expectedMargin: money(3000), termMonths: 24, oneOff: false },
        }),
      ],
      targetingPolicies: [
        policy({
          id: 'pol_lowers_bill',
          kind: 'suitability',
          conditions: [
            { field: 'offer.financials.price.amount', operator: 'lt', value: { path: 'customer.monthly_spend' } },
          ],
        }),
      ],
    }),
    request: request({ input: { customer: { monthly_spend: 3500 } } }),
  },
  {
    // An offer field against a literal. The candidate root without a path value,
    // so a second engine that implemented only one of the two is caught here.
    name: 'a condition reads a field of the candidate against a literal',
    artifact: artifact({
      candidateKeys: threeKeys,
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Eligibility', policyIds: ['pol_short_term'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: [
        offer({ id: 'p_a', key: 'offer_a' }),
        offer({
          id: 'p_b',
          key: 'offer_b',
          financials: { price: money(2000), cost: money(800), expectedMargin: money(1200), termMonths: 12, oneOff: false },
        }),
        offer({
          id: 'p_c',
          key: 'offer_c',
          financials: { price: money(1000), cost: money(400), expectedMargin: money(600), termMonths: 0, oneOff: true },
        }),
      ],
      targetingPolicies: [
        policy({
          id: 'pol_short_term',
          conditions: [{ field: 'offer.financials.termMonths', operator: 'lte', value: 12 }],
        }),
      ],
    }),
    request: request(),
  },
  {
    // The customer side is missing. A path that resolves to nothing fails the
    // comparison whatever the operator: every candidate is refused, none is let
    // through for want of a number. `ne`, not `lt`, on purpose — `2500 < undefined`
    // is false with or without the rule, so an `lt` case would pass in an engine
    // that forgot it; `2500 !== undefined` is true, so only the rule refuses here.
    name: 'a path value whose other side is missing fails closed',
    artifact: artifact({
      candidateKeys: ['offer_lower', 'offer_higher'],
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source' },
        { id: 'n2_filter', type: 'filter', label: 'Suitability', policyIds: ['pol_lowers_bill'] },
        { id: 'n3_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'n1_source', to: 'n2_filter' },
        { from: 'n2_filter', to: 'n3_arbitrate' },
      ],
    }),
    catalogue: catalogue({
      offers: [
        offer({
          id: 'p_lower',
          key: 'offer_lower',
          financials: { price: money(2500), cost: money(900), expectedMargin: money(1600), termMonths: 12, oneOff: false },
        }),
        offer({
          id: 'p_higher',
          key: 'offer_higher',
          financials: { price: money(4500), cost: money(1500), expectedMargin: money(3000), termMonths: 24, oneOff: false },
        }),
      ],
      targetingPolicies: [
        policy({
          id: 'pol_lowers_bill',
          kind: 'suitability',
          conditions: [
            { field: 'offer.financials.price.amount', operator: 'ne', value: { path: 'customer.monthly_spend' } },
          ],
        }),
      ],
    }),
    request: request({ input: { customer: {} } }),
  },
];

// --- Emit -------------------------------------------------------------------

const cases = CASES.map((c) => {
  const trace = execute(c.artifact, c.catalogue, c.request);
  return {
    name: c.name,
    artifact: c.artifact,
    catalogue: c.catalogue,
    request: c.request,
    expected: {
      id: trace.id,
      chainHash: trace.chainHash,
      inputSnapshotHash: trace.decision.inputSnapshotHash,
      catalogueSnapshotHash: trace.decision.catalogueSnapshotHash,
      // The whole reproducible half, so a mismatch says which field diverged
      // rather than only that a hash did.
      decision: trace.decision,
    },
  };
});

// Two cases must not share a chain hash, or one of them is not testing what it
// says it is.
const hashes = new Set(cases.map((c) => c.expected.chainHash));
if (hashes.size !== cases.length) {
  const seen = new Map();
  for (const c of cases) {
    if (seen.has(c.expected.chainHash)) {
      throw new Error(
        `"${c.name}" produces the same decision as "${seen.get(c.expected.chainHash)}" — one of them is not exercising what it claims`
      );
    }
    seen.set(c.expected.chainHash, c.name);
  }
}

const corpus = {
  $comment:
    'GENERATED by scripts/build-decision-corpus.mjs from the TypeScript engine. ' +
    'Do not edit by hand; add a case to the script and regenerate. ' +
    'See docs/adr/ADR-003-canonical-serialisation.md for the hashing rules.',
  algorithm: 'sha256',
  cases,
};

const out = path.join(root, 'docs/conformance/decision-corpus.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf8');

console.log(
  `Wrote docs/conformance/decision-corpus.json: ${cases.length} decisions, ` +
    `${hashes.size} distinct chain hashes. Corpus digest ${hash(cases).slice(0, 16)}.`
);
