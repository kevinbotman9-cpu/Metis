/**
 * The scenario `/arbitration` ranks on.
 *
 * One customer, one slot, one moment. The brief's fibre-serviceable household at
 * the homepage hero: every eligibility, relevance and frequency gate passes, so
 * every candidate the flow names reaches ranking, and what orders them is only
 * the formula. That is the question the screen asks — what would the weights do
 * — so a scenario in which a filter removed half the offers would be answering a
 * different one.
 *
 * Fixed rather than drawn from the ledger: a preview has to show the same
 * candidates every time it is opened, or a moved weight and a different
 * customer are indistinguishable. The same input the flow-authoring and restart
 * tests decide with.
 */

import type { DecisionRequest } from '@metis/runtime/deterministic/types';

export interface ArbitrationScenario {
  id: string;
  name: string;
  description: string;
  placementKey: string;
  request: DecisionRequest;
}

export const fibreAddressScenario: ArbitrationScenario = {
  id: 'fibre-address',
  // Lower case: it is read inside sentences — "Ranking, on the fibre-address
  // scenario" — never as a title on its own.
  name: 'the fibre-address scenario',
  description:
    'A customer on an active DSL line at an address where fibre is available, on the homepage hero. Every gate passes, so every candidate reaches ranking.',
  placementKey: 'homepage_hero',
  request: {
    tenantId: 'telco-us',
    customerId: 'scenario_fibre_address',
    channel: 'web',
    placement: 'homepage_hero',
    occurredAt: '2026-06-01T12:00:00.000Z',
    input: {
      customer: {
        account_status: 'active',
        moving_within_days: 999,
        address: { fios_serviceable: true, fiveg_coverage: 'strong' },
        broadband: { status: 'active', product: 'dsl' },
        orders: { open_broadband: false },
        ott: { disney: false, netflix: false, disney_available: true, netflix_available: true },
        affinity: { gaming: 0.8, entertainment: 0.8 },
        engagement: { digital_or_broadband_intent: true },
        usage: { pct_of_allowance_3mo_avg: 0.94, months_of_history: 14 },
      },
      context: {},
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
    contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
  } as DecisionRequest,
};
