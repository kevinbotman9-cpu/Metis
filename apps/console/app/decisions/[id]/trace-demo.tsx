'use client';

export const MOCK_TRACE = {
  id: 'dec_abc123def456',
  timestamp: new Date().toISOString(),
  artifactVersion: '1.2.0',
  tenantId: 'telco-uk',
  eliminations: [
    {
      nodeId: 'source_1',
      reason: 'Loaded customer profile (age 45, segment: loyal, LTV: $2400)',
      eliminated: [],
    },
    {
      nodeId: 'filter_1',
      reason: 'Eligibility check: age > 18 ✓ and active account ✓',
      eliminated: [],
    },
    {
      nodeId: 'arbitrate_1',
      reason: 'Ranked by: propensity × value formula',
      eliminated: ['offer_retention', 'offer_basic_upgrade'],
    },
  ],
  scores: {
    upsell_5g: 0.87,
    upsell_data: 0.62,
    retention_offer: 0.45,
  },
  arbitration: {
    formula: 'propensity_score × expected_value',
    winner: 'upsell_5g',
  },
  timings: {
    source_1: 3.2,
    filter_1: 1.8,
    arbitrate_1: 2.1,
  },
};
