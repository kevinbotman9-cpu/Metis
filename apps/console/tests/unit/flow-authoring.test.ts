import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST, PUT } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { toSource } from '@/mocks/fixtures/compiled';

/**
 * Authoring a flow, and the two gaps it closes.
 *
 * Both were held by assertions before this existed, because both were the same
 * shape of defect: a write path that worked and an effect that did not.
 *
 *   - **A created offer was not decidable.** A flow's candidate set is a fixed
 *     list, so an offer nothing named was never a candidate however it was
 *     configured elsewhere.
 *   - **A created policy never ran.** The engine evaluates only the policies a
 *     node names in `policyIds`, and nothing attached a new one.
 *
 * Both now resolve by editing the graph. And because decisions run the version
 * promoted to an environment, both need publish and promote to take effect —
 * which is the property the last group here pins.
 */

const AUTH = (email: string) => {
  const u = store.users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture user ${email}`);
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};
/** Authors flows and offers; can publish. */
const SARAH = () => AUTH('sarah.chen@telco.example');
/** Everything, including promote and policies. */
const MARCUS = () => AUTH('marcus.webb@telco.example');
/** Compliance: approves and edits policies, cannot author flows. */
const PRIYA = () => AUTH('priya.natarajan@telco.example');

const call = (
  path: string[],
  body?: unknown,
  method: 'GET' | 'POST' | 'PUT' = 'POST',
  headers = MARCUS()
) => {
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({ path }) };
  if (method === 'GET') return GET(req, ctx);
  return method === 'PUT' ? PUT(req, ctx) : POST(req, ctx);
};

const FLOW = 'next-best-action';

const saveDraft = (patch: Record<string, unknown>, headers = MARCUS()) =>
  call(['artifacts', 'telco-us', FLOW, 'draft'], patch, 'PUT', headers);

/** The brief's fibre-available customer: every gate passes. */
const INPUT = {
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
};

async function decide(customerId = 'cust_flow') {
  const res = await call(['placements', 'telco-us', 'homepage_hero', 'decisions'], {
    request: {
      tenantId: 'telco-us',
      customerId,
      channel: 'web',
      occurredAt: '2026-06-01T12:00:00.000Z',
      input: INPUT,
      consent: { marketing: true, profiling: true, thirdParty: false },
      contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
    },
  });
  const body = (await res.json()) as { entries: { action: string }[] };
  return body.entries.map((e) => e.action);
}

/**
 * Publish the current draft as a new version and promote it to production.
 *
 * Two separate permissions and two separate calls, deliberately: `publish` and
 * `promote` are different authorities and the console keeps them apart.
 */
async function shipIt(version: string) {
  const flow = store.artifacts.find((a) => a.id === FLOW)!;
  const source = toSource({ ...flow, activeVersion: version });

  const published = await call(
    ['registry', 'telco-us', FLOW],
    { version, source },
    'POST',
    SARAH()
  );
  expect(published.status, await published.clone().text()).toBeLessThan(300);

  const promoted = await call(
    ['registry', 'telco-us', FLOW, 'promote'],
    { version, environment: 'production' },
    'POST',
    MARCUS()
  );
  expect(promoted.status, await promoted.clone().text()).toBeLessThan(300);
}

describe('saving a graph', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('saves and reports what the compiler says', async () => {
    const flow = store.artifacts.find((a) => a.id === FLOW)!;
    const res = await saveDraft({ nodes: flow.nodes, edges: flow.edges });
    const body = (await res.json()) as {
      artifact: { nodeCount: number };
      compile: { diagnostics: { severity: string }[] };
    };

    expect(res.status).toBe(200);
    expect(body.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('saves a graph that does not compile, and says why', async () => {
    // A half-connected graph is a normal intermediate state, not an error to
    // refuse. Publish is where a broken flow is meant to be stopped.
    const flow = store.artifacts.find((a) => a.id === FLOW)!;
    const res = await saveDraft({
      nodes: flow.nodes.filter((n) => n.type !== 'arbitrate'),
      edges: [],
    });
    const body = (await res.json()) as { compile: { diagnostics: { code: string }[] } };

    expect(res.status).toBe(200);
    expect(body.compile.diagnostics.map((d) => d.code)).toContain('NO_ARBITRATION');
    // Saved, not discarded.
    expect(store.artifacts.find((a) => a.id === FLOW)!.nodes.some((n) => n.type === 'arbitrate')).toBe(
      false
    );
  });

  it('refuses an account that cannot author flows', async () => {
    const res = await saveDraft({ candidateKeys: ['netflix'] }, PRIYA());
    expect(res.status).toBe(403);
    expect((await res.json()).message).toContain('edit:flows');
  });

  it('records who edited it', async () => {
    await saveDraft({ candidateKeys: ['netflix'] });
    expect(store.auditEvents[0].eventType).toBe('DecisionFlowDraftSaved');
  });
});

describe('an edit reaches decisions only through publish and promote', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('saving alone changes nothing', async () => {
    // The governance property. If this ever fails, the console has become a
    // deploy button that does not say so.
    const before = await decide();
    await saveDraft({ candidateKeys: ['netflix'] });
    expect(await decide()).toEqual(before);
  });

  it('publishing and promoting applies it', async () => {
    const before = await decide();
    expect(before).toContain('fios_gigabit');

    await saveDraft({ candidateKeys: ['netflix'] });
    await shipIt('2.0.0');

    const after = await decide();
    expect(after).not.toContain('fios_gigabit');
    expect(after).toContain('netflix');
  });
});

describe('the two gaps close', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('a created offer becomes decidable once a flow names it', async () => {
    // Held as a gap since 2026-09-07: createOffer worked, the offer reached the
    // catalogue, and no flow could select it.
    const created = await call(
      ['offers', 'telco-us'],
      {
        key: 'upsell_speed_boost',
        name: 'Speed boost',
        description: 'A faster line for a small increase.',
        objectiveId: 'iss_growth',
        categoryId: 'grp_broadband',
        financials: {
          price: { amount: 500, currency: 'GBP' },
          cost: { amount: 100, currency: 'GBP' },
          expectedMargin: { amount: 4800, currency: 'GBP' },
          termMonths: 12,
          oneOff: false,
        },
        validity: { startsAt: '2026-01-01', endsAt: null },
        boost: 1,
        policyIds: [],
        status: 'draft',
      },
      'POST',
      SARAH()
    );
    expect(created.status, await created.text()).toBe(201);

    // A creative, because publish refuses an offer that could win and have
    // nothing to deliver — NO_DELIVERABLE_CREATIVE. The compiler catching that
    // here is the gate working, so the test walks the whole authoring chain
    // rather than routing around it.
    const offer = store.offers.find((o) => o.key === 'upsell_speed_boost')!;
    const creative = await call(
      ['creatives', 'telco-us', offer.id],
      {
        channel: 'web',
        name: 'Speed boost hero',
        locale: 'en-GB',
        active: true,
        content: {
          // The content declares its own channel; the creative and its content
          // disagreeing is exactly what the validator refuses.
          channel: 'web',
          headline: 'A faster line for £5 more',
          subheadline: 'Same router, more speed.',
          ctaLabel: 'See the speeds',
          ctaUrl: '/broadband/boost',
          placement: 'homepage_hero',
          placementType: 'hero',
        },
      },
      'POST',
      SARAH()
    );
    expect(creative.status, await creative.clone().text()).toBe(201);
    offer.status = 'active';

    expect(await decide()).not.toContain('upsell_speed_boost');

    await saveDraft({ candidateKeys: ['upsell_speed_boost'] });
    await shipIt('2.1.0');

    expect(await decide()).toContain('upsell_speed_boost');
  });

  it('a created policy applies once a node names it', async () => {
    // The other half, held by `aggregation-decision.test.ts` until now: the
    // engine evaluates only what a node names in `policyIds`.
    const created = await call(
      ['targeting-policies', 'telco-us'],
      {
        name: 'Refuse everyone',
        kind: 'eligibility',
        description: 'A gate that suppresses every candidate.',
        // Impossible, and on a field this tenant's schema actually declares:
        // usage share is 0 to 1. `customer.age` stood here, and once the
        // schema stopped declaring it the flow naming this policy no longer
        // compiled, so it was never promoted and the test was asserting
        // against the previous version rather than the new rule.
        conditions: [
          { field: 'customer.usage.pct_of_allowance_3mo_avg', operator: 'gt', value: 200 },
        ],
        scope: { level: 'tenant', targetId: null },
        active: true,
      },
      'POST',
      PRIYA()
    );
    expect(created.status).toBe(201);
    const policyId = ((await created.json()) as { id: string }).id;

    expect(await decide()).not.toEqual([]);

    const flow = store.artifacts.find((a) => a.id === FLOW)!;
    await saveDraft({
      nodes: flow.nodes.map((n) =>
        n.id === 'filter_eligibility'
          ? { ...n, policyIds: [...(n.policyIds ?? []), policyId] }
          : n
      ),
    });
    await shipIt('2.2.0');

    expect(await decide()).toEqual([]);
  });
});
