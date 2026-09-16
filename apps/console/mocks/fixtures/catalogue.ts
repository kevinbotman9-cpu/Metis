/**
 * Deterministic fixture store for the telco-us tenant.
 *
 * Every ID is stable and hand-assigned. Nothing here uses Math.random or
 * Date.now at module scope, so a decision link is resolvable across reloads
 * and screenshots are reproducible.
 *
 * This is the ONLY place sample data lives. Components read it through the
 * generated client, which MSW intercepts.
 */

import type {
  Objective,
  Category,
  Offer,
  Creative,
  TargetingPolicy,
  FrequencyPolicy,
  ArbitrationConfig,
  Boost,
  AutonomySetting,
  AgentActivity,
  Connector,
  PackManifest,
  Placement,
  TenantSettings,
} from '@metis/core/domain';

/** Fixed clock so timestamps are stable across runs. */
const T0 = Date.parse('2026-09-01T09:00:00Z');
const iso = (offsetHours: number) => new Date(T0 + offsetHours * 3600_000).toISOString();

// ---------------------------------------------------------------------------
// Shorthands
// ---------------------------------------------------------------------------
//
// Written as helpers rather than as 1,600 lines of repeated literals. Five
// offers with two creatives each and eighteen policies is a small catalogue,
// and spelling every field out for each one hides the differences between them
// in the noise of what they share.

const usd = (amount: number) => ({ amount, currency: 'USD' as const });

/** A web creative for the homepage grid, which is where the slate renders. */
function web(
  id: string,
  offerId: string,
  offerName: string,
  headline: string,
  subheadline: string,
  asset: string,
  ctaLabel: string,
  ctaUrl: string
): Creative {
  return {
    id,
    offerId,
    name: `${offerName} — web`,
    channel: 'web',
    content: {
      channel: 'web',
      headline,
      subheadline,
      imageUrl: `/assets/offers/${asset}.jpg`,
      ctaLabel,
      ctaUrl,
      // No slot named, which is the form that fills any web slot: a creative
      // naming one slot cannot fill the others, and the brief gives each offer
      // a single web tile rather than one per slot. Authoring five offers
      // across four web slots would be twenty creatives, nineteen of which
      // nobody wrote.
      placement: '',
      placementType: 'tile',
    },
    active: true,
    locale: 'en-US',
    createdAt: iso(-600),
    updatedAt: iso(-6),
  };
}

function email(
  id: string,
  offerId: string,
  offerName: string,
  subject: string,
  preheader: string,
  body: string
): Creative {
  return {
    id,
    offerId,
    name: `${offerName} — email`,
    channel: 'email',
    content: {
      channel: 'email',
      subject,
      preheader,
      body,
      fromName: 'Meridian Mobile',
      fromAddress: 'offers@meridian.example',
    },
    active: true,
    locale: 'en-US',
    createdAt: iso(-600),
    updatedAt: iso(-6),
  };
}

type Conditions = TargetingPolicy['conditions'];

function policy(
  kind: TargetingPolicy['kind'],
  id: string,
  name: string,
  description: string,
  conditions: Conditions,
  scope: TargetingPolicy['scope']
): TargetingPolicy {
  return {
    id,
    name,
    kind,
    description,
    conditions,
    scope,
    active: true,
    createdAt: iso(-600),
    updatedAt: iso(-600),
  };
}

/** Hard filter: can we offer this at all? */
const el = (
  id: string,
  name: string,
  description: string,
  conditions: Conditions,
  scope: TargetingPolicy['scope']
) => policy('eligibility', id, name, description, conditions, scope);

/** Situational: should we offer it now? */
const rel = (
  id: string,
  name: string,
  description: string,
  conditions: Conditions,
  scope: TargetingPolicy['scope']
) => policy('relevance', id, name, description, conditions, scope);
// ---------------------------------------------------------------------------
// Objectives — their "business issue"
// ---------------------------------------------------------------------------

export const objectives: Objective[] = [
  {
    id: 'iss_acquisition',
    name: 'Acquisition',
    key: 'acquisition',
    description: 'Win the broadband line at the service address.',
    sortOrder: 1,
    createdAt: iso(-720),
    updatedAt: iso(-48),
  },
  {
    id: 'iss_crosssell',
    name: 'Cross-Sell',
    key: 'cross-sell',
    description: 'Attach gaming and streaming to a line that already has broadband.',
    sortOrder: 2,
    createdAt: iso(-720),
    updatedAt: iso(-48),
  },
];

// ---------------------------------------------------------------------------
// Categories — their "group"
// ---------------------------------------------------------------------------

export const categories: Category[] = [
  {
    id: 'grp_broadband',
    objectiveId: 'iss_acquisition',
    name: 'Broadband',
    key: 'broadband',
    description: 'Fiber and fixed-wireless internet at a service address.',
    sortOrder: 1,
    createdAt: iso(-700),
    updatedAt: iso(-48),
  },
  {
    id: 'grp_entertainment',
    objectiveId: 'iss_crosssell',
    name: 'Entertainment',
    key: 'entertainment',
    description: 'Gaming and streaming, sold onto an existing broadband line.',
    sortOrder: 2,
    createdAt: iso(-700),
    updatedAt: iso(-48),
  },
];

// ---------------------------------------------------------------------------
// Offers — their "action"
// ---------------------------------------------------------------------------

/**
 * Five offers, and nothing else.
 *
 * Exactly what the customer's brief names. The tenant this replaced carried
 * 251 — eleven authored and 240 generated — and the generated ones existed to
 * make screens look inhabited. A tenant with five products has screens that
 * look like a tenant with five products, which is the honest state.
 *
 * **`price` and `cost` are zero because the brief supplies neither.** Every
 * screen that renders money shows $0.00 for all five. That is a blank, not a
 * defect: a plausible-looking price nobody supplied is exactly the filler this
 * file exists to keep out. Registered as G-089 so it is not read as one.
 *
 * **Validity starts before the seeded history.** The demo shows 24 months of
 * decisions; an offer dated from this year would put two-thirds of that history
 * out of its validity window, and `OUT_OF_VALIDITY_WINDOW` would be the most
 * common refusal in the tenant — a statement about the catalogue's age rather
 * than about any customer. The brief gives no launch dates, so these say the
 * products were sellable throughout the period the demo displays.
 *
 * `expectedMargin` carries the brief's own **business value** — 100, 100, 100,
 * 80, 70 — in cents, because `V = expectedMargin / 60000` is the value term
 * the ranking function reads. Arbitration depends on the ratio, so the order
 * this produces is the order the brief describes, and every number traces to a
 * row in the deck rather than to an estimate made here.
 */
const authoredOffers: Offer[] = [
  {
    id: 'off_fios_gigabit',
    categoryId: 'grp_broadband',
    objectiveId: 'iss_acquisition',
    name: 'FIOS Gigabit',
    key: 'fios_gigabit',
    description: 'Full-fiber gigabit internet, where the address can take it.',
    status: 'active',
    financials: { price: usd(0), cost: usd(0), expectedMargin: usd(10000), termMonths: 0, oneOff: false },
    validity: { startsAt: '2024-01-01', endsAt: null },
    boost: 1.0,
    policyIds: ['pol_fios_serviceable', 'pol_not_on_fios', 'pol_fios_interest'],
    creativeIds: ['crt_fios_web', 'crt_fios_email'],
    tags: ['broadband', 'fiber'],
    createdAt: iso(-600),
    updatedAt: iso(-6),
    updatedBy: 'sarah.chen@telco.example',
  },
  {
    id: 'off_5g_home_ultimate',
    categoryId: 'grp_broadband',
    objectiveId: 'iss_acquisition',
    name: '5G Home Ultimate',
    key: '5g_home_ultimate',
    description: 'Fixed-wireless home internet where 5G coverage is strong.',
    status: 'active',
    financials: { price: usd(0), cost: usd(0), expectedMargin: usd(10000), termMonths: 0, oneOff: false },
    validity: { startsAt: '2024-01-01', endsAt: null },
    boost: 1.0,
    policyIds: ['pol_5g_coverage', 'pol_not_on_5g_home', 'pol_5g_bandwidth_need'],
    creativeIds: ['crt_5g_web', 'crt_5g_sms'],
    tags: ['broadband', 'fixed-wireless'],
    createdAt: iso(-600),
    updatedAt: iso(-6),
    updatedBy: 'sarah.chen@telco.example',
  },
  {
    id: 'off_gaming_plus_bundle',
    categoryId: 'grp_entertainment',
    objectiveId: 'iss_crosssell',
    name: 'Gaming Plus Bundle',
    key: 'gaming_plus_bundle',
    description: 'Low-latency router and gaming add-on for an existing line.',
    status: 'active',
    financials: { price: usd(0), cost: usd(0), expectedMargin: usd(10000), termMonths: 0, oneOff: false },
    validity: { startsAt: '2024-01-01', endsAt: null },
    boost: 1.0,
    policyIds: ['pol_has_broadband', 'pol_gaming_affinity'],
    creativeIds: ['crt_gaming_web', 'crt_gaming_email'],
    tags: ['entertainment', 'gaming'],
    createdAt: iso(-600),
    updatedAt: iso(-6),
    updatedBy: 'sarah.chen@telco.example',
  },
  {
    id: 'off_disney_plus',
    categoryId: 'grp_entertainment',
    objectiveId: 'iss_crosssell',
    name: 'Disney Plus',
    key: 'disney_plus',
    description: 'Partner streaming bundle, three months promotional.',
    status: 'active',
    financials: { price: usd(0), cost: usd(0), expectedMargin: usd(8000), termMonths: 0, oneOff: false },
    validity: { startsAt: '2024-01-01', endsAt: null },
    boost: 1.0,
    policyIds: ['pol_disney_available', 'pol_not_on_disney'],
    creativeIds: ['crt_disney_web', 'crt_disney_email'],
    tags: ['entertainment', 'ott', 'partner'],
    createdAt: iso(-600),
    updatedAt: iso(-6),
    updatedBy: 'sarah.chen@telco.example',
  },
  {
    id: 'off_netflix',
    categoryId: 'grp_entertainment',
    objectiveId: 'iss_crosssell',
    name: 'Netflix',
    key: 'netflix',
    description: 'Partner streaming bundle, standard tier.',
    status: 'active',
    financials: { price: usd(0), cost: usd(0), expectedMargin: usd(7000), termMonths: 0, oneOff: false },
    validity: { startsAt: '2024-01-01', endsAt: null },
    boost: 1.0,
    policyIds: ['pol_netflix_available', 'pol_not_on_netflix'],
    creativeIds: ['crt_netflix_web', 'crt_netflix_email'],
    tags: ['entertainment', 'ott', 'partner'],
    createdAt: iso(-600),
    updatedAt: iso(-6),
    updatedBy: 'sarah.chen@telco.example',
  },
];

export const offers: Offer[] = [...authoredOffers];

// ---------------------------------------------------------------------------
// Creatives — the content for an offer on a channel
// ---------------------------------------------------------------------------

/**
 * Ten creatives, for the three channels this platform has.
 *
 * The brief names fifteen pieces of per-channel content, across five channels: web tile,
 * app card, agent script, email and SMS. **App card and agent script cannot be
 * authored at all** — `Channel` is `email | sms | web | push | outbound_call`,
 * and neither an in-app card nor an agent desktop is one of them. Push is not
 * an app card. Registered as G-090; the three app cards and two agent scripts
 * are absent rather than approximated with a channel that means something
 * else.
 */
const authoredCreatives: Creative[] = [
  web('crt_fios_web', 'off_fios_gigabit', 'FIOS Gigabit',
    'Gigabit fiber is available at your address',
    'Install in as little as one visit. Your line, your speed.',
    'fios-gigabit', 'Check install dates', '/broadband/fios/install'),
  email('crt_fios_email', 'off_fios_gigabit', 'FIOS Gigabit',
    'Fiber is ready at your address',
    'Gigabit speeds, installed in one visit.',
    'Your address can take full-fiber gigabit internet. Pick an install date online.'),

  web('crt_5g_web', 'off_5g_home_ultimate', '5G Home Ultimate',
    '5G Home Ultimate, no line install',
    'Plug the router in and you are online. Coverage is strong at your address.',
    '5g-home', 'Activate a router', '/broadband/5g-home/activate'),
  {
    id: 'crt_5g_sms',
    offerId: 'off_5g_home_ultimate',
    name: '5G Home Ultimate — SMS',
    channel: 'sms',
    content: {
      channel: 'sms',
      text: '5G Home Ultimate is available at your address. Activate a router: mrdn.example/5g',
      senderId: 'MERIDIAN',
    },
    active: true,
    locale: 'en-US',
    createdAt: iso(-600),
    updatedAt: iso(-6),
  },

  web('crt_gaming_web', 'off_gaming_plus_bundle', 'Gaming Plus Bundle',
    'Gaming Plus, on the line you already have',
    'A low-latency router and a gaming add-on, on one bill.',
    'gaming-plus', 'Add Gaming Plus', '/entertainment/gaming-plus'),
  email('crt_gaming_email', 'off_gaming_plus_bundle', 'Gaming Plus Bundle',
    'Lower latency on the line you already have',
    'Gaming Plus adds a low-latency router.',
    'Gaming Plus bundles a low-latency router with a gaming add-on, on your existing bill.'),

  web('crt_disney_web', 'off_disney_plus', 'Disney Plus',
    'Disney+ for three months, on us',
    'Added to your broadband bill. Cancel any time.',
    'disney-plus', 'Add Disney+', '/entertainment/disney-plus'),
  email('crt_disney_email', 'off_disney_plus', 'Disney Plus',
    'Three months of Disney+ on your broadband bill',
    'Added to the bill you already pay.',
    'Add Disney+ to your broadband bill and the first three months are on us.'),

  web('crt_netflix_web', 'off_netflix', 'Netflix',
    'Netflix on your broadband bill',
    'Standard tier, one bill, cancel any time.',
    'netflix', 'Add Netflix', '/entertainment/netflix'),
  email('crt_netflix_email', 'off_netflix', 'Netflix',
    'Add Netflix to your broadband bill',
    'Standard tier, one bill.',
    'Netflix standard tier, added to your broadband bill. Cancel any time.'),
];

export const creatives: Creative[] = [...authoredCreatives];

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

/**
 * None.
 *
 * The tenant this replaced carried two UK regulatory packs — Consumer Duty and
 * age restrictions — whose policies are gone with the catalogue they governed.
 * Nothing is authored in their place: the brief names no regulatory rule, and a
 * pack invented here would be a claim about a market nobody described. The
 * packs screen is empty, which is the true answer.
 */
export const packs: PackManifest[] = [];

// ---------------------------------------------------------------------------
// Targeting policies — their three-tier qualification model
// ---------------------------------------------------------------------------

export const targetingPolicies: TargetingPolicy[] = [
  // --- Eligibility: can we offer this at all? ------------------------------
  el('pol_account_active', 'Active account',
    'Every offer in the brief requires an active consumer account.',
    [{ field: 'customer.account_status', operator: 'eq', value: 'active' }],
    { level: 'tenant', targetId: null }),

  el('pol_fios_serviceable', 'Fiber serviceable at the address',
    'Do not offer fiber where it cannot be installed. The value arrives from conn_serviceability, so a refusal can name the system that supplied the evidence.',
    [{ field: 'customer.address.fios_serviceable', operator: 'eq', value: true }],
    { level: 'offer', targetId: 'off_fios_gigabit' }),

  el('pol_5g_coverage', '5G Home coverage is strong',
    'Fixed wireless needs strong coverage at the service address, not merely a signal.',
    [{ field: 'customer.address.fiveg_coverage', operator: 'eq', value: 'strong' }],
    { level: 'offer', targetId: 'off_5g_home_ultimate' }),

  el('pol_no_open_broadband_order', 'No open broadband order',
    'A line already being provisioned is not a line to sell again.',
    [{ field: 'customer.orders.open_broadband', operator: 'eq', value: false }],
    { level: 'category', targetId: 'grp_broadband' }),

  el('pol_has_broadband', 'Broadband service on the account',
    'Gaming Plus is an add-on to a line. Without the line there is nothing to add it to.',
    [{ field: 'customer.broadband.status', operator: 'eq', value: 'active' }],
    { level: 'offer', targetId: 'off_gaming_plus_bundle' }),

  // Two policies reading one field each, because the model has no grouping
  // below a category. The alternative was one category-scoped rule, which
  // would also gate Gaming Plus - and Gaming Plus is this carrier's own
  // bundle, not a partner's, so partner availability says nothing about it.
  el('pol_disney_available', 'Disney+ partner bundle available in region',
    'A partner bundle can only be sold where the agreement covers the region.',
    [{ field: 'customer.ott.disney_available', operator: 'eq', value: true }],
    { level: 'offer', targetId: 'off_disney_plus' }),

  el('pol_netflix_available', 'Netflix partner bundle available in region',
    'A partner bundle can only be sold where the agreement covers the region.',
    [{ field: 'customer.ott.netflix_available', operator: 'eq', value: true }],
    { level: 'offer', targetId: 'off_netflix' }),

  // --- Relevance: should we offer it now? ----------------------------------
  //
  // The brief's third column is headed "Suitability (customer interest)" and
  // holds affinity and intent signals. Those are relevance here. This platform
  // means something narrower by suitability - affordability and ethics, the
  // tier a regulator reads - and filing a gaming affinity under it would put a
  // marketing signal in a compliance tier.
  rel('pol_not_moving', 'Not moving within 30 days',
    'A line sold into an address they are leaving is a line that will be cancelled.',
    [{ field: 'customer.moving_within_days', operator: 'gt', value: 30 }],
    { level: 'category', targetId: 'grp_broadband' }),

  rel('pol_not_on_fios', 'Not already on FIOS',
    'They already hold it. This is also what suppresses it after acceptance.',
    [{ field: 'customer.broadband.product', operator: 'ne', value: 'fios' }],
    { level: 'offer', targetId: 'off_fios_gigabit' }),

  rel('pol_not_on_5g_home', 'No existing 5G Home subscription',
    'They already hold it. This is also what suppresses it after acceptance.',
    [{ field: 'customer.broadband.product', operator: 'ne', value: '5g_home' }],
    { level: 'offer', targetId: 'off_5g_home_ultimate' }),

  rel('pol_broadband_need_met', 'Broadband need already met',
    'Entertainment is a cross-sell onto a working line. This rule opens the category once broadband is provisioned, and it is why the follow-up interaction shows gaming and streaming rather than another broadband offer.',
    [{ field: 'customer.broadband.status', operator: 'eq', value: 'active' }],
    { level: 'category', targetId: 'grp_entertainment' }),

  rel('pol_fios_interest', 'Digital engagement or broadband intent',
    'One field, not two conditions: the brief asks for digital engagement OR a broadband intent signal, and a policy ANDs its conditions. The disjunction is computed in the profile and named so a reader can see which question it answers.',
    [{ field: 'customer.engagement.digital_or_broadband_intent', operator: 'eq', value: true }],
    { level: 'offer', targetId: 'off_fios_gigabit' }),

  rel('pol_5g_bandwidth_need', 'Bandwidth need in the usage profile',
    'Offer the bigger pipe to the households using the one they have.',
    [{ field: 'customer.usage.pct_of_allowance_3mo_avg', operator: 'gte', value: 0.8 }],
    { level: 'offer', targetId: 'off_5g_home_ultimate' }),

  rel('pol_entertainment_affinity', 'Entertainment affinity above threshold',
    'The category gate: do not push streaming at a household that shows no interest in it.',
    [{ field: 'customer.affinity.entertainment', operator: 'gte', value: 0.5 }],
    { level: 'category', targetId: 'grp_entertainment' }),

  rel('pol_gaming_affinity', 'Gaming affinity',
    'Gaming Plus asks for more than a general interest in entertainment.',
    [{ field: 'customer.affinity.gaming', operator: 'gte', value: 0.5 }],
    { level: 'offer', targetId: 'off_gaming_plus_bundle' }),

  rel('pol_not_on_disney', 'Not already subscribed to Disney+',
    'Do not sell a bundle they already have.',
    [{ field: 'customer.ott.disney', operator: 'ne', value: true }],
    { level: 'offer', targetId: 'off_disney_plus' }),

  rel('pol_not_on_netflix', 'Not already subscribed to Netflix',
    'Do not sell a bundle they already have.',
    [{ field: 'customer.ott.netflix', operator: 'ne', value: true }],
    { level: 'offer', targetId: 'off_netflix' }),

  // --- Suitability ---------------------------------------------------------
  //
  // Empty, deliberately. The brief names no affordability or ethics rule, and
  // this is the tier a regulator reads: inventing one would be worse than an
  // empty tier, and moving the brief's interest signals into it would be
  // mislabelling marketing as compliance. `/targeting-policies` says so on the
  // screen rather than leaving a reader to notice the absence.
];

// ---------------------------------------------------------------------------
// Frequency and suppression policies
// ---------------------------------------------------------------------------

/**
 * Two of the brief's six, and the gap between those numbers is the honest part.
 *
 * **What maps.** The reject rest period, which became real on 2026-09-11
 * (G-086), and the per-channel caps.
 *
 * **What is modelled as relevance instead.** Accepted-offer suppression and
 * "broadband need fulfilled" are triggered in the brief by Interaction History.
 * Decisions here never read outcomes — `DecisionRequest` has no field carrying
 * them — so both come from what the customer now holds: `pol_not_on_fios`,
 * `pol_not_on_5g_home` and `pol_broadband_need_met`. The demo shows the same
 * effect; the mechanism is the profile, not the log, and the panel says so.
 *
 * **What cannot be expressed at all.** The over-exposure cap — five impressions
 * in seven days *with no click* — because a cap counts contacts and cannot
 * condition on what the customer did with them. Registered as G-091.
 */
export const frequencyPolicies: FrequencyPolicy[] = [
  {
    id: 'cpol_web_daily',
    name: 'Web session cap',
    description:
      'At most three decisioned slots a day on the web, and a 30-day rest on any offer the customer declines.',
    channel: 'web',
    maxContacts: 3,
    period: 'day',
    cooldownDaysAfterReject: 30,
    scope: { level: 'tenant', targetId: null },
    active: true,
  },
  {
    id: 'cpol_email_weekly',
    name: 'Email weekly cap',
    description: 'At most two marketing emails a week, and a 30-day rest after a decline.',
    channel: 'email',
    maxContacts: 2,
    period: 'week',
    cooldownDaysAfterReject: 30,
    scope: { level: 'tenant', targetId: null },
    active: true,
  },
];

// ---------------------------------------------------------------------------
// Arbitration
// ---------------------------------------------------------------------------

/**
 * Their PCVL, with every exponent at 1.0 as the brief has it.
 *
 * The brief's worked example carries C = 1.0 on every row, and this tenant runs
 * no scoring node, so P and C are the flow's declared defaults rather than
 * model output. Priority is therefore value times boost, and the trace says so
 * on every decision it makes.
 */
export const arbitrationConfig: ArbitrationConfig = {
  id: 'arb_telco_us',
  tenantId: 'telco-us',
  weights: { propensity: 1.0, value: 1.0, boost: 1.0, context: 1.0 },
  utility: { id: 'multiplicative', version: '1.0.0' },
  formula: 'Priority = P^1.0 × C^1.0 × V^1.0 × B^1.0',
  updatedAt: iso(-72),
  updatedBy: 'marcus.webb@telco.example',
};

/**
 * Two boosts, and between them they decide every position in the demo.
 *
 * FIOS Gigabit, 5G Home Ultimate and Gaming Plus all carry business value 100
 * and a per-offer multiplier of 1.0 in the brief, so its FIOS-first order is
 * produced entirely by its ADM propensity — 0.82 against 0.58 and 0.46. This platform
 * has no model. With nothing declared, those three tie and the engine falls
 * back to sorting by key, which means nothing at all.
 *
 * So every position is carried by a boost with a name, an owner and a date, and
 * the demo can say why each offer sits where it sits. `lev_fiber_first` puts
 * fiber top where the address supports it; `lev_line_before_addon` puts the
 * broadband line above the add-on that attaches to it. Without the second one
 * the engine settled 5G Home against Gaming Plus by sorting keys, and in the
 * no-fiber scenario that alphabetical accident chose the headline slot.
 *
 * The difference from the brief is worth pointing at rather than hiding: an
 * order no model explains has to be explained by a business decision somebody
 * signed.
 */
export const boosts: Boost[] = [
  {
    id: 'lev_fiber_first',
    name: 'Fiber first where the address supports it',
    scope: { level: 'offer', targetId: 'off_fios_gigabit' },
    value: 1.1,
    reason:
      'Fiber leads where the address can take it. Authored for this demo by the product owner to break the three-way tie at business value 100: the customer has supplied no business-value ranking of their own, and the brief carries that order on an adaptive model this platform does not have.',
    validity: null,
    updatedAt: iso(-12),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'lev_line_before_addon',
    name: 'The line before the add-on',
    scope: { level: 'offer', targetId: 'off_5g_home_ultimate' },
    value: 1.05,
    reason:
      'A broadband line outranks an add-on that attaches to one: selling the line is what makes the add-on possible, and a household with no internet cannot use a gaming bundle. Authored for this demo by the product owner to break the second tie at business value 100 — 5G Home Ultimate and Gaming Plus Bundle were level, and the engine was settling it by sorting keys alphabetically, which is an accident rather than a decision. In the no-fiber scenario that accident decided the headline slot.',
    validity: null,
    updatedAt: iso(-12),
    updatedBy: 'marcus.webb@telco.example',
  },
];

// ---------------------------------------------------------------------------
// Agentic autonomy
// ---------------------------------------------------------------------------

const baseGuardrails = {
  maxBlastRadiusPct: 5,
  allowedChangeTypes: ['boost_adjust', 'creative_copy'] as const,
  maxBoostDelta: 0.1,
  maxBudgetDelta: usd(50000),
  protectedAttributes: [
    'customer.ethnicity',
    'customer.religion',
    'customer.health_status',
    'customer.zip_income_decile',
  ],
  requireSimulationPass: true,
  biasGateThreshold: 1.2,
};

export const autonomySettings: AutonomySetting[] = [
  {
    id: 'aut_tenant_default',
    scope: { level: 'tenant', targetId: null },
    level: 'L2',
    guardrails: { ...baseGuardrails, allowedChangeTypes: [...baseGuardrails.allowedChangeTypes] },
    rationale:
      'Default posture: agents may open change sets with a diff and simulation, but a human approves every publish.',
    updatedAt: iso(-200),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'aut_crosssell_restricted',
    scope: { level: 'objective', targetId: 'iss_crosssell' },
    level: 'L1',
    guardrails: {
      ...baseGuardrails,
      maxBlastRadiusPct: 0,
      allowedChangeTypes: [],
      maxBoostDelta: 0,
      maxBudgetDelta: usd(0),
    },
    rationale:
      'Cross-sell onto an existing line carries fair-value obligations: the household is already paying us. Agents may draft copy for review but may not open or apply changes.',
    updatedAt: iso(-120),
    updatedBy: 'priya.natarajan@telco.example',
  },
  {
    id: 'aut_entertainment_bounded',
    scope: { level: 'category', targetId: 'grp_entertainment' },
    level: 'L3',
    guardrails: {
      ...baseGuardrails,
      maxBlastRadiusPct: 25,
      allowedChangeTypes: ['boost_adjust', 'creative_copy'],
      maxBoostDelta: 0.15,
      maxBudgetDelta: usd(200000),
    },
    rationale:
      'Low-value, low-risk add-ons with no contractual commitment. Agents may auto-publish copy and boost changes inside guardrails; breaches auto-revert.',
    updatedAt: iso(-48),
    updatedBy: 'sarah.chen@telco.example',
  },
  {
    id: 'aut_partner_content_observe',
    scope: { level: 'offer', targetId: 'off_disney_plus' },
    level: 'L0',
    guardrails: {
      ...baseGuardrails,
      maxBlastRadiusPct: 0,
      allowedChangeTypes: [],
      maxBoostDelta: 0,
      maxBudgetDelta: usd(0),
    },
    rationale:
      'Partner content. The wording belongs to the partner and is contractually fixed, so an agent may explain this offer and never modify it.',
    updatedAt: iso(-96),
    updatedBy: 'priya.natarajan@telco.example',
  },
];

// ---------------------------------------------------------------------------
// Agent activity feed
// ---------------------------------------------------------------------------

/**
 * None.
 *
 * The entries this replaced were agent proposals about a roaming pass, a bill
 * shock alert and a 4G bundle — products this tenant does not sell. Repointing
 * their ids at the new catalogue would have left the prose describing
 * proposals nobody made about offers nobody has.
 *
 * A tenant whose catalogue was authored today has no agent history, and the
 * autonomy screen showing none is the true answer rather than a gap.
 */
export const agentActivity: AgentActivity[] = [];

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface FixtureUser {
  id: string;
  email: string;
  password: string;
  name: string;
  roles: string[];
  permissions: string[];
  tenantId: string;
}


// ---------------------------------------------------------------------------
// Integrations
//
// Configured once here, and actually used at decision time: the flows in
// ./artifacts.ts name these on their source nodes, and ./engine.ts resolves
// them before executing. Their values land in the hashed input snapshot, so a
// decision that used the bureau replays exactly as well as one that did not.
// ---------------------------------------------------------------------------

export const connectors: Connector[] = [
  {
    id: 'conn_serviceability',
    name: 'Address serviceability',
    kind: 'rest',
    description:
      'What the network can deliver at a service address: whether fiber can be installed, and how strong 5G Home coverage is. The customer brief turns on this answer — a fiber address and a non-fiber address are the same visitor with one field different, and this is the field.',
    target: 'https://serviceability.telco.example/v1/address',
    // Declared, not measured, and not supplied by the customer — the same
    // blank as the prices (G-089), in a field that has to hold a number.
    // At 45 the compiler refused the flow outright: LATENCY_BUDGET_EXCEEDED,
    // 53.2ms against this tenant's 50ms, because one dependency at 45 leaves
    // five for everything else. It was right to. This is in line with the
    // other REST connectors here, and the real figure has to come from
    // whoever owns the serviceability API.
    declaredP95Ms: 20,
    timeoutMs: 90,
    onFailure: 'fail',
    cacheTtlSeconds: 86400,
    provides: [
      { field: 'customer.address.fios_serviceable', path: 'serviceability.fiosServiceable', type: 'boolean' },
      { field: 'customer.address.fiveg_coverage', path: 'serviceability.fivegCoverage', type: 'string' },
    ],
    active: true,
    updatedAt: '2026-09-01T09:00:00.000Z',
    updatedBy: 'priya.natarajan@telco.example',
  },
  {
    id: 'conn_order_book',
    name: 'Order book',
    kind: 'rest',
    description:
      'Whether a broadband order is already open on the account. A line being provisioned is not a line to sell again, and this is what makes the difference visible to a policy.',
    target: 'https://orders.telco.example/v1/account',
    declaredP95Ms: 25,
    timeoutMs: 90,
    onFailure: 'fail',
    cacheTtlSeconds: 30,
    provides: [
      { field: 'customer.orders.open_broadband', path: 'orders.openBroadband', type: 'boolean' },
    ],
    active: true,
    updatedAt: '2026-09-01T09:00:00.000Z',
    updatedBy: 'priya.natarajan@telco.example',
  },
  {
    id: 'conn_engagement',
    name: 'Engagement and partner availability',
    kind: 'feature-store',
    description:
      'Category affinities, and which partner streaming agreements cover this region. Affinity is a computed score rather than a model output: it is read here, not predicted.',
    target: 'features://engagement/v1',
    declaredP95Ms: 6,
    timeoutMs: 30,
    onFailure: 'fail',
    cacheTtlSeconds: 600,
    provides: [
      { field: 'customer.affinity.gaming', path: 'affinity.gaming', type: 'number' },
      { field: 'customer.affinity.entertainment', path: 'affinity.entertainment', type: 'number' },
      { field: 'customer.ott.disney_available', path: 'partners.disney', type: 'boolean' },
      { field: 'customer.ott.netflix_available', path: 'partners.netflix', type: 'boolean' },
    ],
    active: true,
    updatedAt: '2026-09-01T09:00:00.000Z',
    updatedBy: 'priya.natarajan@telco.example',
  },
  {
    id: 'conn_billing_ledger',
    name: 'Billing ledger',
    kind: 'feature-store',
    description:
      'Current balance, arrears and rolling spend, pre-computed nightly and served from the online store.',
    target: 'featurestore://telco-us/billing',
    declaredP95Ms: 3,
    timeoutMs: 25,
    onFailure: 'fail',
    cacheTtlSeconds: 300,
    provides: [
      { field: 'customer.monthly_spend', path: 'billing.rollingSpendPence', type: 'number' },
      { field: 'customer.arrears_days', path: 'billing.arrearsDays', type: 'number' },
      { field: 'customer.in_good_standing', path: 'billing.goodStanding', type: 'boolean' },
    ],
    active: true,
    updatedAt: '2026-07-14T09:20:00.000Z',
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'conn_network_usage',
    name: 'Network usage',
    kind: 'feature-store',
    description: 'Rolling 30-day data usage and account tenure from the mediation platform.',
    target: 'featurestore://telco-us/usage',
    declaredP95Ms: 4,
    timeoutMs: 25,
    onFailure: 'omit',
    cacheTtlSeconds: 900,
    // `customer.usage.roaming_days` was here until 2026-09-12, and dropping it
    // is not tidying. This connector is one of five the live flow's source
    // node calls, so the route fetched the field on every decision; no
    // targeting policy reads it, this tenant sells no mobile plan, and the
    // generated corpus requests do not carry it. That last one is what made it
    // visible: a field the route resolves and the corpus omits enters the
    // hashed input on one side only, so all 60 service cases diverged on chain
    // hash while agreeing on every winner. See G-098 — the corpus agrees with
    // the console's own endpoint only while every connector field the flow
    // calls is already in the request, and nothing checks that.
    provides: [
      { field: 'customer.usage.data_usage_gb', path: 'usage.dataGb', type: 'number' },
      { field: 'customer.tenure_months', path: 'account.tenureMonths', type: 'number' },
    ],
    active: true,
    updatedAt: '2026-07-14T09:22:00.000Z',
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'conn_consent_registry',
    name: 'Consent registry',
    kind: 'rest',
    description:
      'Marketing and profiling consent of record. Defaults closed on failure, because assuming consent is the one mistake with a regulator attached.',
    target: 'https://consent.telco.example/v2/subject',
    declaredP95Ms: 12,
    timeoutMs: 40,
    onFailure: 'default',
    cacheTtlSeconds: 60,
    provides: [
      { field: 'customer.marketing_consent', path: 'consent.marketing', type: 'boolean', defaultValue: false },
      { field: 'customer.profiling_consent', path: 'consent.profiling', type: 'boolean', defaultValue: false },
    ],
    active: true,
    updatedAt: '2026-08-02T14:05:00.000Z',
    updatedBy: 'priya.natarajan@telco.example',
  },
  {
    id: 'conn_credit_bureau',
    name: 'Credit bureau',
    kind: 'rest',
    description:
      'Full bureau file. Configured, and deliberately not wired into any live flow: at 180ms it cannot be called synchronously inside a 50ms budget, and the compiler says so rather than letting it fail in production.',
    target: 'https://bureau.example/v1/file',
    declaredP95Ms: 180,
    timeoutMs: 400,
    onFailure: 'fail',
    cacheTtlSeconds: 86400,
    provides: [
      { field: 'customer.credit_score', path: 'file.score', type: 'number' },
      { field: 'customer.credit_band', path: 'file.band', type: 'string' },
    ],
    active: true,
    updatedAt: '2026-08-19T11:40:00.000Z',
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'conn_device_catalogue',
    name: 'Device catalogue',
    kind: 'rest',
    description: 'Handset stock and lead times. Not yet activated pending contract sign-off.',
    target: 'https://devices.telco.example/v1/stock',
    declaredP95Ms: 30,
    timeoutMs: 100,
    onFailure: 'omit',
    cacheTtlSeconds: 600,
    provides: [{ field: 'context.device_in_stock', path: 'stock.available', type: 'boolean' }],
    active: false,
    updatedAt: '2026-08-28T16:10:00.000Z',
    updatedBy: 'sarah.chen@telco.example',
  },
];

export const users: FixtureUser[] = [
  {
    id: 'usr_sarah',
    email: 'sarah.chen@telco.example',
    password: 'demo',
    name: 'Sarah Chen',
    roles: ['architect', 'marketer'],
    permissions: [
      'view:offers',
      'edit:offers',
      'view:flows',
      'edit:flows',
      'publish:flows',
      'view:decisions',
      'view:audit',
      // Added 2026-09-10 with the gate on /targeting-policies and
      // /frequency-policy. She had neither view: nor edit:policies while the
      // Policy group was tagged to her personas, so enforcing the declaration
      // would have emptied the group for the persona it exists for. The
      // fixture was wrong, not the permission.
      'view:policies',
      'request:changes',
    ],
    tenantId: 'telco-us',
  },
  {
    id: 'usr_priya',
    email: 'priya.natarajan@telco.example',
    password: 'demo',
    name: 'Priya Natarajan',
    roles: ['compliance'],
    permissions: [
      'view:offers',
      'view:flows',
      'view:decisions',
      'view:audit',
      'view:policies',
      'edit:policies',
      'approve:changes',
      // She held `edit:autonomy` and no permission to read the ladder, which
      // was survivable only while nothing checked. `view:integrations` reaches
      // the inbound call log — request and response bodies, customer ids
      // included — and a compliance officer refused that while an operator saw
      // it would be the wrong way round on this product.
      'view:autonomy',
      'edit:autonomy',
      'view:integrations',
    ],
    tenantId: 'telco-us',
  },
  {
    id: 'usr_marcus',
    email: 'marcus.webb@telco.example',
    password: 'demo',
    name: 'Marcus Webb',
    roles: ['admin', 'architect'],
    permissions: [
      'view:offers',
      'edit:offers',
      'view:flows',
      'edit:flows',
      'view:decisions',
      'view:audit',
      'view:policies',
      'edit:policies',
      'approve:changes',
      'request:changes',
      'edit:arbitration',
      'view:autonomy',
      'edit:autonomy',
      'view:integrations',
      'edit:integrations',
      'publish:flows',
      'promote:flows',
      'admin:settings',
    ],
    tenantId: 'telco-us',
  },
  {
    // The account that makes the guard falsifiable.
    //
    // Sarah, Priya and Marcus each hold every permission the navigation
    // manifest gates a screen on. So until 2026-09-10 no seeded account could
    // be refused anything, and a test that signed in and found a screen open
    // could not tell an enforced permission from an unenforced one. That is
    // half of why `/decisions`, `/decision-flows` and `/performance` declared
    // a permission nothing checked and nothing went red for a year.
    //
    // He held `view:decisions` for one afternoon, until the check that every
    // gated permission has an account refusing it pointed out that all four
    // accounts had it and nothing could exercise that gate either. An operator
    // keeps the pipes running: he reads what called in and what went back, and
    // has no business in the offer catalogue, the compliance log, the
    // decision history or the flows.
    id: 'usr_oliver',
    email: 'oliver.reed@telco.example',
    password: 'demo',
    name: 'Oliver Reed',
    roles: ['operator'],
    permissions: ['view:integrations'],
    tenantId: 'telco-us',
  },
];

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

/**
 * The slots a site can ask about, and how many actions each holds.
 *
 * `key` is the value a decision request already carries and a web creative
 * already names, so this configures what existed rather than replacing it.
 *
 * Not part of `catalogueSnapshot`: a placement governs delivery, not the
 * decision, and adding it to what the engine hashes would move every chain
 * hash to configure something the engine does not read.
 */
/**
 * How this tenant presents dates, numbers and money. G-092.
 *
 * American, because the tenant is: the brief is a US carrier's, and every
 * offer is priced in dollars. A reviewer reading “05/09” in a trace should
 * read the ninth of May, not the fifth of September.
 */
export const tenantSettings: TenantSettings = {
  tenantId: 'telco-us',
  locale: 'en-US',
  currency: 'USD',
  updatedAt: iso(-600),
  updatedBy: 'marcus.webb@telco.example',
};

export const placements: Placement[] = [
  {
    id: 'plc_homepage_hero',
    key: 'homepage_hero',
    name: 'Homepage hero',
    type: 'hero',
    description: 'The full-width banner above the fold. One action, unauthenticated traffic.',
    channel: 'web',
    slotCount: 1,
    artifactId: 'next-best-action',
    decidable: true,
    delivery: { mode: 'caller' },
    updatedAt: iso(-72),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'plc_homepage_grid',
    key: 'homepage_grid',
    name: 'Homepage grid',
    type: 'tile',
    description: 'Three cards below the hero. The slot that needs a slate rather than a winner.',
    channel: 'web',
    slotCount: 3,
    artifactId: 'next-best-action',
    decidable: true,
    delivery: { mode: 'caller' },
    updatedAt: iso(-72),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'plc_account_dashboard_hero',
    key: 'account_dashboard_hero',
    name: 'Account dashboard hero',
    type: 'hero',
    description: 'The signed-in dashboard banner. One action, and the customer is known.',
    channel: 'web',
    slotCount: 1,
    artifactId: 'next-best-action',
    decidable: true,
    delivery: { mode: 'caller' },
    updatedAt: iso(-48),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'plc_usage_page_inline',
    key: 'usage_page_inline',
    name: 'Usage page inline',
    type: 'feature_band',
    description: 'A single cross-sell strip under the usage meter.',
    channel: 'web',
    slotCount: 1,
    artifactId: 'next-best-action',
    decidable: true,
    delivery: { mode: 'caller' },
    updatedAt: iso(-48),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'plc_weekly_offers_send',
    key: 'weekly_offers_send',
    name: 'Weekly offers email',
    description:
      'The weekly send. Decided here; delivered by nothing yet — the outbound adapter is W-017.',
    channel: 'email',
    slotCount: 2,
    artifactId: 'next-best-action',
    decidable: true,
    delivery: null,
    updatedAt: iso(-200),
    updatedBy: 'priya.nair@telco.example',
  },

  // The three slots the corpus decides for and the registry had never heard of.
  //
  // Every one of these is a `placement` on thousands of the corpus's decisions
  // — `triggered_outbound` 2,097 times, `retention_queue` 2,061, `app_inbox`
  // 2,055, counted from the committed index before ADR-018 §6 deleted it — and
  // none of them existed here. `decidePlacement`
  // would have answered 404 for all three. Nothing checked, because nothing
  // joined the corpus back to this list; `tests/unit/fixtures.test.ts` does now.
  {
    id: 'plc_triggered_outbound',
    key: 'triggered_outbound',
    name: 'Triggered SMS',
    type: 'feature_band',
    description: 'A single message on a trigger — usage threshold, contract date, network event.',
    channel: 'sms',
    slotCount: 1,
    artifactId: 'next-best-action',
    decidable: true,
    delivery: null,
    updatedAt: iso(-200),
    updatedBy: 'priya.nair@telco.example',
  },
  {
    id: 'plc_app_inbox',
    key: 'app_inbox',
    name: 'App inbox',
    type: 'tile',
    description: 'The message list inside the app. Two slots, and the customer is known.',
    channel: 'push',
    slotCount: 2,
    artifactId: 'next-best-action',
    // Not decidable. This tenant has no push content at all: the brief's
    // app card is not a push notification, and there is no `app` channel to
    // author one on (G-090). A slot that called itself decidable with nothing
    // to deliver is the mistake G-071 was.
    decidable: false,
    delivery: null,
    updatedAt: iso(-200),
    updatedBy: 'priya.nair@telco.example',
  },
  // Configured and switched off, which is a state a real tenant has and the
  // only one that proves `active` is load-bearing: `decidePlacement` answers
  // 404 for it. Nothing decides for this slot, which is what makes it safe to
  // leave off — the corpus deciding for an inactive slot is now a failing test
  // in `fixtures.test.ts`.
  //
  // It exists because activating `weekly_offers_send` on 2026-09-10 left the
  // fixture with no inactive placement at all, and `placement-decision.test.ts`
  // said so rather than passing vacuously.
  {
    id: 'plc_basket_upsell',
    key: 'basket_upsell',
    name: 'Basket upsell (paused)',
    type: 'feature_band',
    description:
      'A strip in the checkout basket. Switched off after the January test; the slot is kept so the history reads.',
    channel: 'web',
    slotCount: 1,
    artifactId: 'next-best-action',
    decidable: false,
    delivery: { mode: 'caller' },
    updatedAt: iso(-1400),
    updatedBy: 'marcus.webb@telco.example',
  },
];
