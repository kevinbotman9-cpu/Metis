/**
 * The seeded `demo-telco-uk` catalogue, from Part 6 of the console spec.
 *
 * Eleven hand-written offers are enough to prove a screen renders and nowhere
 * near enough to show what one feels like. A list of eleven does not scroll, a
 * facet with eleven members has no shape, and a chart of eleven points is a
 * chart of eleven points. This generates the rest: real-shaped names, a value
 * distribution that is not flat, authors who are people, and dates that are
 * irregular because real ones are.
 *
 * **Everything here is a function of `seededUnitInterval`**, which is sha256
 * over its arguments — so the catalogue is byte-identical on every reload, on
 * every machine, and a screenshot taken today matches one taken next week.
 * Nothing uses `Math.random` or `Date.now`.
 *
 * The hand-written offers in `./catalogue.ts` stay exactly as they are. They
 * are named by artifacts, policies and a dozen tests, and they are the ones a
 * demo actually walks through; these sit behind them and give the screens
 * their texture.
 */

import { seededUnitInterval } from '@metis/runtime/deterministic/canonical';
import type { Offer, Creative, Money } from '@metis/core/domain';

/** The same fixed clock `./catalogue.ts` uses. */
const T0 = Date.parse('2026-09-01T09:00:00Z');
const DAY = 86_400_000;

/** 24 months of history, which is what the spec asks the charts to show. */
export const SEED_MONTHS = 24;
export const SEED_START = T0 - SEED_MONTHS * 30 * DAY;

const gbp = (amount: number): Money => ({ amount, currency: 'GBP' });

/** One draw. Every value in this file traces back to a call like this. */
const r = (...parts: (string | number)[]) => seededUnitInterval('demo-telco-uk', ...parts);

const pick = <T>(xs: readonly T[], ...salt: (string | number)[]): T =>
  xs[Math.floor(r(...salt) * xs.length)] as T;

/**
 * People, not `user_04`.
 *
 * The three at the top are the fixture accounts that can sign in; the rest are
 * colleagues who authored something and never log in during a demo, which is
 * also true of most authors in a real tenant.
 */
const AUTHORS = [
  'sarah.chen@telco.example',
  'priya.natarajan@telco.example',
  'marcus.webb@telco.example',
  'james.okonkwo@telco.example',
  'aisha.rahman@telco.example',
  'tom.beckett@telco.example',
  'lucy.fairweather@telco.example',
  'daniel.osei@telco.example',
  'nina.kowalski@telco.example',
  'raj.venkatesan@telco.example',
] as const;

// ---------------------------------------------------------------------------
// Names
//
// Composed per category so a name fits where it sits. "Unlimited 5G upgrade —
// existing handset" is the shape; "Test Offer 1" is what this exists to avoid.
// ---------------------------------------------------------------------------

const MOBILE_PLANS = [
  'Unlimited 5G', 'Unlimited 5G Plus', '100GB 5G', '60GB 5G', '30GB 5G',
  '20GB Essential', '10GB Starter', 'Family Share 150GB', 'Family Share 80GB',
  'Business 5G Unlimited', 'Data-only 200GB',
] as const;

const FIBRE = [
  'Full Fibre 900', 'Full Fibre 500', 'Full Fibre 150', 'Superfast 67',
  'Superfast 36', 'Gigabit Pro 1800',
] as const;

const HANDSET_TIERS = [
  'flagship handset', 'mid-range handset', 'entry handset', 'existing handset',
  'refurbished handset',
] as const;

const TERMS = ['12-month term', '24-month term', '36-month term', 'SIM only', 'rolling monthly'] as const;

const ADDONS = [
  'Roaming Pass', 'Entertainment Bundle', 'Device Protection', 'Multi-room TV',
  'Static IP', 'Cloud Backup 1TB', 'International Minutes', 'Wi-Fi Guarantee',
  'Security Suite', 'Priority Support',
] as const;

const ACCESSORIES = [
  'Wireless earbuds', 'Smart watch', 'Tablet bundle', 'Power bank',
  'Screen protection', 'Wireless charger', 'Car mount kit', 'Mesh extender',
] as const;

const SERVICE = [
  'Bill explainer', 'Direct Debit switch', 'Paperless billing', 'Usage alerts',
  'Payment plan', 'Accessibility review', 'Coverage check', 'Plan health check',
] as const;

const INCENTIVES = [
  'first 3 months half price', '£50 bill credit', 'no upfront cost',
  'double data for 6 months', 'free installation', 'loyalty tier pricing',
] as const;

const SEGMENT_QUALIFIERS = [
  'existing handset', 'out of contract', 'in-contract upgrade', 'heavy data user',
  'light user', 'family account', 'business account', 'student', 'over-60s',
] as const;

/** Category → how an offer in it is named, and what it costs. */
interface CategoryShape {
  categoryId: string;
  objectiveId: string;
  /** A name and the key stem it implies. */
  name: (i: number) => string;
  /** Monthly price in pence, before the Pareto weighting. */
  basePrice: [number, number];
  tags: readonly string[];
}

const SHAPES: readonly CategoryShape[] = [
  {
    categoryId: 'grp_new_mobile',
    objectiveId: 'iss_acquisition',
    name: (i) => `${pick(MOBILE_PLANS, 'nm', i)} — ${pick(TERMS, 'nmt', i)}`,
    basePrice: [1200, 6500],
    tags: ['mobile', 'acquisition'],
  },
  {
    categoryId: 'grp_new_broadband',
    objectiveId: 'iss_acquisition',
    name: (i) => `${pick(FIBRE, 'nb', i)} — ${pick(TERMS, 'nbt', i)}`,
    basePrice: [2400, 8900],
    tags: ['broadband', 'acquisition'],
  },
  {
    categoryId: 'grp_contract_renewal',
    objectiveId: 'iss_retention',
    name: (i) => `${pick(MOBILE_PLANS, 'cr', i)} renewal — ${pick(SEGMENT_QUALIFIERS, 'crq', i)}`,
    basePrice: [1000, 5500],
    tags: ['renewal', 'retention'],
  },
  {
    categoryId: 'grp_winback',
    objectiveId: 'iss_retention',
    name: (i) => `${pick(MOBILE_PLANS, 'wb', i)} winback — ${pick(INCENTIVES, 'wbi', i)}`,
    basePrice: [900, 4200],
    tags: ['winback', 'retention'],
  },
  {
    categoryId: 'grp_data_upsell',
    objectiveId: 'iss_growth',
    name: (i) => `${pick(MOBILE_PLANS, 'du', i)} upgrade — ${pick(HANDSET_TIERS, 'duh', i)}`,
    basePrice: [500, 3500],
    tags: ['upsell', 'growth'],
  },
  {
    categoryId: 'grp_accessories',
    objectiveId: 'iss_growth',
    name: (i) =>
      r('acc-kind', i) > 0.5
        ? `${pick(ACCESSORIES, 'ac', i)} — ${pick(INCENTIVES, 'aci', i)}`
        : `${pick(ADDONS, 'ad', i)} — ${pick(TERMS, 'adt', i)}`,
    basePrice: [199, 1500],
    tags: ['add-on', 'growth'],
  },
  {
    categoryId: 'grp_account_health',
    objectiveId: 'iss_service',
    name: (i) => `${pick(SERVICE, 'sv', i)} — ${pick(SEGMENT_QUALIFIERS, 'svq', i)}`,
    basePrice: [0, 400],
    tags: ['service'],
  },
] as const;

/** `Full Fibre 900 — 24-month term` → `full_fibre_900_24_month_term`. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

// ---------------------------------------------------------------------------
// Value distribution
// ---------------------------------------------------------------------------

/**
 * Pareto: a fifth of the catalogue carries most of the value.
 *
 * A flat distribution is the tell that makes generated data look generated —
 * every bar the same height, every percentile the same number, and a "top
 * offers by margin" panel that means nothing. This is a power law with the
 * exponent set so the top 20% hold roughly 80% of total expected margin;
 * `tests/unit/seed.test.ts` measures the actual share rather than trusting it.
 */
function paretoWeight(index: number, total: number): number {
  const u = (index + 0.5) / total;
  return Math.pow(u, -0.72);
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

/** How many the generator adds on top of the hand-written eleven. */
export const GENERATED_OFFER_COUNT = 240;

/**
 * The offer that carries a bias warning — one of the three things the spec
 * asks to be wrong on purpose.
 *
 * There is no bias-finding schema and no `/simulations/bias` route, so this is
 * carried where the built screens can already show it: a tag, which the offers
 * grid facets on and the detail page renders, plus a description that says what
 * was found. A demo can filter to it and open it; nothing here pretends an
 * analysis ran.
 */
export const BIAS_FLAGGED_INDEX = 37;

export const seededOffers: Offer[] = Array.from({ length: GENERATED_OFFER_COUNT }, (_, i) => {
  const shape = SHAPES[i % SHAPES.length];
  const name = shape.name(i);
  const key = `${slug(name)}_${i}`;

  const [lo, hi] = shape.basePrice;
  const price = Math.round(lo + r('price', i) * (hi - lo));
  const cost = Math.round(price * (0.28 + r('cost', i) * 0.34));
  const termMonths = pick([1, 12, 18, 24, 36], 'term', i);

  // Rank by a stable draw, then weight by that rank. Two offers with adjacent
  // prices can be very far apart in total value, which is what a real
  // catalogue looks like.
  const rank = Math.floor(r('rank', i) * GENERATED_OFFER_COUNT);
  const margin = Math.round((price - cost) * Math.max(termMonths, 1) * paretoWeight(rank, GENERATED_OFFER_COUNT));

  // Irregular, and spread wider than the decision history so that decisions
  // made two years ago had something to choose from. A catalogue that all came
  // into existence last quarter cannot explain a two-year decision log: every
  // older decision would fall out of every validity window, which is exactly
  // what the first run of this generator did — 100% of pre-2026 decisions
  // suppressed on OUT_OF_VALIDITY_WINDOW. The mild exponent keeps authoring
  // clustered recently without emptying the far end.
  // Roughly two in five are launch catalogue — the SIM-only plans and service
  // actions that have been available the whole time and are what an old
  // decision actually chose between. The rest were added progressively, which
  // is why a decision from 2024 sees a smaller catalogue than one from last
  // week. Without the evergreen share, every pre-2026 decision fell out of
  // every validity window and suppressed.
  const evergreen = r('evergreen', i) > 0.58;
  const ageDays = evergreen
    ? 760 + Math.floor(r('age', i) * 140)
    : Math.floor(Math.pow(r('age', i), 1.3) * 730);
  const createdAt = new Date(T0 - ageDays * DAY - Math.floor(r('hh', i) * 8) * 3600_000).toISOString();
  const updatedAt = new Date(
    Date.parse(createdAt) + Math.floor(r('touch', i) * ageDays * DAY)
  ).toISOString();

  const status: Offer['status'] =
    r('status', i) > 0.82 ? (r('retired', i) > 0.55 ? 'retired' : 'paused') : 'active';

  const biased = i === BIAS_FLAGGED_INDEX;

  return {
    id: `prop_seed_${i}`,
    categoryId: shape.categoryId,
    objectiveId: shape.objectiveId,
    name,
    key,
    description: biased
      ? `${name}. Held for review: acceptance skews by age band beyond the agreed tolerance, and the reason is not yet understood.`
      : `${name}. ${pick(SEGMENT_QUALIFIERS, 'desc', i)} pricing, reviewed ${new Date(Date.parse(updatedAt)).toISOString().slice(0, 7)}.`,
    status: biased ? 'paused' : status,
    financials: {
      price: gbp(price),
      cost: gbp(cost),
      expectedMargin: gbp(margin),
      termMonths,
      oneOff: termMonths === 1,
    },
    validity: {
      startsAt: createdAt.slice(0, 10),
      // Most run open-ended; a minority are seasonal and end.
      endsAt:
        r('ends', i) > 0.78
          ? new Date(T0 + Math.floor(r('endin', i) * 200) * DAY).toISOString().slice(0, 10)
          : null,
    },
    boost: Number((0.7 + r('boost', i) * 0.9).toFixed(2)),
    policyIds: [],
    creativeIds: [],
    tags: biased
      ? [...shape.tags, 'bias-review', 'held']
      : [...shape.tags, ...(r('tag', i) > 0.7 ? ['seasonal'] : []), ...(margin > 200_000 ? ['high-margin'] : [])],
    createdAt,
    updatedAt,
    updatedBy: pick(AUTHORS, 'author', i),
  };
});

// ---------------------------------------------------------------------------
// Creatives
// ---------------------------------------------------------------------------

const CHANNELS = ['email', 'sms', 'web', 'push'] as const;

/**
 * Content for the generated offers.
 *
 * Not every offer gets one, deliberately: an offer with nothing to deliver is
 * a real state the console refuses to activate, and `fixtures.test.ts` asserts
 * at least one exists. Roughly one in nine is left without.
 */
export const seededCreatives: Creative[] = seededOffers.flatMap((offer, i) => {
  if (r('has-content', i) > 0.89) return [];

  const count = 1 + Math.floor(r('n-content', i) * 3);
  return Array.from({ length: count }, (_, c) => {
    const channel = CHANNELS[(i + c) % CHANNELS.length];
    const created = new Date(Date.parse(offer.createdAt) + c * 3600_000).toISOString();

    const content =
      channel === 'email'
        ? {
            channel: 'email' as const,
            subject: offer.name,
            preheader: `${offer.name} — from £${(offer.financials.price.amount / 100).toFixed(2)} a month`,
            body: `Hi {{first_name}}, ${offer.name.toLowerCase()} is available on your account from £${(offer.financials.price.amount / 100).toFixed(2)} a month.`,
            fromName: 'Telco UK',
            fromAddress: 'offers@telco.example',
          }
        : channel === 'sms'
          ? {
              channel: 'sms' as const,
              text: `${offer.name} from £${(offer.financials.price.amount / 100).toFixed(2)}/mo. See telco.uk/offers. Opt out: STOP`,
              senderId: 'TelcoUK',
            }
          : channel === 'web'
            ? {
                channel: 'web' as const,
                headline: offer.name,
                subheadline: `From £${(offer.financials.price.amount / 100).toFixed(2)} a month.`,
                placement: '',
                placementType: pick(['hero', 'tile', 'feature_band', 'carousel'], 'shape', i, c),
              }
            : {
                channel: 'push' as const,
                title: offer.name,
                body: `From £${(offer.financials.price.amount / 100).toFixed(2)} a month on your account.`,
              };

    return {
      id: `trt_seed_${i}_${c}`,
      offerId: offer.id,
      name: `${offer.name} — ${channel}`,
      channel,
      content,
      active: offer.status === 'active' && r('content-live', i, c) > 0.12,
      locale: 'en-GB',
      createdAt: created,
      updatedAt: created,
    } as Creative;
  });
});

/** Wire each offer to the content that belongs to it. */
for (const creative of seededCreatives) {
  const offer = seededOffers.find((o) => o.id === creative.offerId);
  if (offer) offer.creativeIds.push(creative.id);
}

// ---------------------------------------------------------------------------
// Candidate sets
// ---------------------------------------------------------------------------

/**
 * What a flow considers, drawn from the seeded catalogue.
 *
 * A flow does not evaluate the whole catalogue and neither should this one: a
 * homepage hero asks about broadband, not about 240 things. The subset is
 * capped because engine cost tracks the candidate set rather than the
 * catalogue — measured at roughly 0.6ms per decision at twenty candidates and
 * 5.2ms at two hundred and forty, which across ten thousand decisions is the
 * difference between six seconds and a minute.
 *
 * Deterministic: the same flow always gets the same offers.
 */
export function seededCandidateKeys(objectiveId: string, limit = 18): string[] {
  const deliverable = new Set(
    seededCreatives.filter((c) => c.active).map((c) => c.offerId)
  );

  return seededOffers
    // Active, and with something to deliver.
    //
    // The compiler refuses a flow that names an offer with no creative —
    // NO_DELIVERABLE_CREATIVE, "even if it wins there is nothing to deliver" —
    // and it is right to. Roughly one seeded offer in nine has no content on
    // purpose, because that is a real state the console has to show; those
    // belong in the catalogue and not in a candidate set. Naming a paused one
    // is the same mistake more quietly: every candidate denied on NOT_ACTIVE,
    // filling the trace with noise that says nothing about the customer.
    .filter(
      (o) => o.objectiveId === objectiveId && o.status === 'active' && deliverable.has(o.id)
    )
    .sort((a, b) => r('cand', a.id) - r('cand', b.id))
    .slice(0, limit)
    .map((o) => o.key);
}
