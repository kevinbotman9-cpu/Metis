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
      formula: 'P^wP x V^wV x L^wL x C^wC',
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

function request(over = {}) {
  return {
    tenantId: 't',
    customerId: 'cust_1',
    channel: 'web',
    placement: 'hero',
    occurredAt: '2026-06-01T12:00:00.000Z',
    input: { tenureMonths: 24 },
    ...over,
  };
}

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
        formula: 'P^wP x V^wV x L^wL x C^wC',
        updatedAt: '2020-01-01T00:00:00.000Z',
        updatedBy: 'fixture',
      },
    }),
    request: request(),
  },
  {
    name: 'tie on priority breaks by key',
    // Two identical offers differing only in key. Sort stability is not
    // guaranteed across languages, so the engine breaks ties explicitly.
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
    request: request({
      consent: { marketing: false, profiling: true, thirdParty: false },
    }),
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
