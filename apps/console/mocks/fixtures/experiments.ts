import type { Experiment } from '@metis/core/experiment';

/**
 * The tenant's experiments.
 *
 * One draft and one stopped, and deliberately **none running**.
 *
 * A running experiment adds `experiments.<key>` to every decision's input,
 * which is hashed — so seeding one would silently move every chain hash in the
 * product, including the ones the JVM service is held to. That is the correct
 * behaviour for an experiment somebody *started*, and exactly the wrong thing
 * for a fixture to do on everybody's behalf.
 *
 * Starting one is therefore a deliberate act with a visible consequence, which
 * is what the page explains and what `experiments.test.ts` exercises.
 *
 * The draft is a holdout rather than a copy test, because a holdout is the
 * harder case to model and the one this architecture handles unusually well —
 * the arm reaches an eligibility policy as an ordinary field, so suppressing
 * the untreated group needs no engine support at all.
 */
export const experiments: Experiment[] = [
  {
    id: 'exp_fibre_holdout',
    tenantId: 'telco-uk',
    key: 'fibre_holdout',
    name: 'Full Fibre holdout',
    description:
      'One in ten customers is held back from every fibre offer, so the uplift can be measured against people who were eligible and never asked.',
    arms: [
      {
        key: 'holdout',
        name: 'Held back',
        weight: 10,
        holdout: true,
      },
      { key: 'treated', name: 'Offered as usual', weight: 90 },
    ],
    status: 'draft',
    startedAt: null,
    stoppedAt: null,
    updatedAt: '2026-09-01T09:00:00.000Z',
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'exp_hero_copy',
    tenantId: 'telco-uk',
    key: 'hero_copy',
    name: 'Homepage hero wording',
    description:
      'Two headlines for the homepage hero. Stopped; kept because the decisions it influenced are still in the ledger and still have to be explainable.',
    arms: [
      { key: 'control', name: 'Original', weight: 50, holdout: true },
      { key: 'variant', name: 'Shorter', weight: 50 },
    ],
    status: 'stopped',
    startedAt: '2026-08-01T09:00:00.000Z',
    stoppedAt: '2026-08-28T09:00:00.000Z',
    updatedAt: '2026-08-28T09:00:00.000Z',
    updatedBy: 'sarah.chen@telco.example',
  },
];
