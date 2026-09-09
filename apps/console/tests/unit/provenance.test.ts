import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GET as ROUTE_GET, POST as ROUTE_POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { decisions } from '../../mocks/fixtures/decisions';
import { provenanceFor, provenanceOver, isSeededDecision } from '../../mocks/provenance';

/**
 * A synthetic number says so, wherever it goes.
 *
 * The seeded `demo-telco-uk` tenant became indistinguishable from real
 * reporting on 2026-09-09. 10,400 decisions, 2,101 measured outcomes, click
 * rates between 16% and 35%, realised value in pounds that differs plausibly
 * from expected, and a genuine-looking underperformer — every figure derived
 * from `seededUnitInterval` and none from a customer. The only marker was a
 * badge in the corner of the nav rail: no test covered it, no API response
 * carried it, no exported file mentioned it, and a screenshot of the report
 * did not include it.
 *
 * The rule these hold is that **a marker living only in the interface is not a
 * marker.** A number leaves this building three ways — an API call, an export,
 * and a screenshot — and it has to be marked on all three.
 */


const MARCUS = () => {
  const u = store.users.find((x) => x.email === 'marcus.webb@telco.example')!;
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};

async function call(
  path: string[],
  body?: unknown,
  method: 'GET' | 'POST' = 'GET',
  query: Record<string, string> = {}
) {
  // The query goes on the URL and never into `params.path`: the route reads
  // `new URL(req.url).searchParams` for one and matches the other segment by
  // segment, so folding them together makes every path a 404.
  const qs = new URLSearchParams(query).toString();
  const req = new Request(`http://localhost/api/${path.join('/')}${qs ? `?${qs}` : ''}`, {
    method,
    headers: MARCUS(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({ path }) };
  return method === 'GET' ? ROUTE_GET(req, ctx) : ROUTE_POST(req, ctx);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function GET(path: string[], query: Record<string, string> = {}): Promise<any> {
  const res = await call(path, undefined, 'GET', query);
  expect(res.status, `GET /${path.join('/')}`).toBe(200);
  return res.json();
}

async function POST(path: string[], body: unknown): Promise<any> {
  const res = await call(path, body, 'POST');
  expect(res.status, await res.clone().text()).toBeLessThan(300);
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('provenance is decided by the seed index, not by a guess', () => {
  it('calls a seeded decision synthetic and an unknown one recorded', () => {
    expect(isSeededDecision(decisions[0].id)).toBe(true);
    expect(isSeededDecision('dec_definitely_not_seeded')).toBe(false);
    expect(provenanceFor(decisions[0].id).source).toBe('synthetic');
    expect(provenanceFor('dec_live_one').source).toBe('recorded');
  });

  it('calls a set that joins both mixed, and carries the ratio', () => {
    const p = provenanceOver([decisions[0].id, decisions[1].id, 'dec_live_one']);
    expect(p.source).toBe('mixed');
    expect(p.syntheticCount).toBe(2);
    expect(p.recordedCount).toBe(1);
    // The note has to stand alone in a file somebody opens months later.
    expect(p.note).toMatch(/demo-telco-uk/);
    expect(p.note).toMatch(/[Nn]ot evidence/);
  });

  it('says nothing rather than guessing when there is nothing to describe', () => {
    const p = provenanceOver([]);
    expect(p.syntheticCount).toBe(0);
    expect(p.recordedCount).toBe(0);
  });
});

describe('every response derived from the seed carries its provenance', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('marks the decision search', async () => {
    const body = await GET(['decisions', 'search'], { limit: '25' });
    expect(body.provenance, 'the grid is the most-read synthetic surface').toBeDefined();
    expect(body.provenance.source).toBe('synthetic');
    expect(body.provenance.note).toMatch(/no real customer/);
  });

  it('marks a seeded trace', async () => {
    const body = await GET(['decisions', decisions[0].id, 'trace']);
    expect(body.provenance.source).toBe('synthetic');
  });

  it('marks the performance report, and says it is mixed once somebody clicks', async () => {
    const before = await GET(['performance', 'telco-uk']);
    expect(before.provenance.source).toBe('synthetic');
    expect(before.provenance.syntheticCount).toBeGreaterThan(10_000);

    // A live decision through the API, then a real outcome against it. This is
    // exactly what a reviewer clicking the storefront produces, and the report
    // must stop calling itself purely synthetic the moment it happens.
    const made = await POST(['decisions'], {
      artifactId: 'next-best-action',
      request: liveRequest(),
    });
    expect(made.decision?.id ?? made.id, JSON.stringify(made).slice(0, 200)).toBeTruthy();

    const after = await GET(['performance', 'telco-uk']);
    expect(after.provenance.source).toBe('mixed');
    expect(after.provenance.recordedCount).toBeGreaterThan(0);
    expect(after.provenance.note).toMatch(/Mixed/);
  });

  it('marks the outcomes of a seeded decision', async () => {
    const withOutcomes = decisions.find((d) => d.winner);
    const body = await GET(['outcomes', 'telco-uk', withOutcomes!.id]);
    expect(body.provenance).toBeDefined();
    expect(body.provenance.source).toBe('synthetic');
  });
});

describe('the marker cannot be quietly removed', () => {
  const APP = resolve(__dirname, '../../app');

  /**
   * Screens whose figures derive from the seed and are worth screenshotting.
   *
   * Named one by one rather than inferred. A pattern would quietly widen, and
   * the point of the list is that adding a screen to it is a decision somebody
   * makes on purpose — the same discipline `tests/vocabulary.test.ts` follows
   * for its allow-list.
   */
  const MUST_RENDER = [
    'app/performance/page.tsx',
    'app/decisions/page.tsx',
    'app/decisions/[id]/page.tsx',
  ];

  it('renders the banner on every screen that shows derived numbers', () => {
    const missing = MUST_RENDER.filter((rel) => {
      const source = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      return !source.includes('<ProvenanceBanner');
    });
    expect(
      missing,
      'a screenshot of this screen would carry no marker — see components/ui/provenance-banner.tsx'
    ).toEqual([]);
  });

  it('keeps the banner in the content column, never in the nav rail', () => {
    // The failure this replaced: a badge in the corner of the shell, which a
    // screenshot of the report does not include. If the banner moves back into
    // the shell it stops doing the one job it has.
    const shell = readFileSync(resolve(APP, '../components/app-shell.tsx'), 'utf8');
    expect(shell).not.toContain('<ProvenanceBanner');
  });

  it('still carries the fixture badge in the shell, as the standing reminder', () => {
    // Untested until 2026-09-09, which is how it came to be the only marker.
    // It is not sufficient and it is not useless: it is the thing that is true
    // on every screen including the ones with no numbers on them.
    const shell = readFileSync(resolve(APP, '../components/app-shell.tsx'), 'utf8');
    expect(shell).toContain('Fixture data');
  });

  it('exports the record with its provenance, not beside it', () => {
    // In the payload. A file that says it is synthetic in a filename or a
    // covering email is a file that stops saying so the moment it is renamed
    // or forwarded.
    const trace = readFileSync(resolve(APP, 'decisions/[id]/page.tsx'), 'utf8');
    expect(trace).toMatch(/downloadJson\([\s\S]{0,600}provenance:/);
    const flow = readFileSync(resolve(APP, 'decision-flows/[id]/page.tsx'), 'utf8');
    expect(flow).toMatch(/downloadJson\([\s\S]{0,600}provenance:/);
  });
});

function liveRequest() {
  return {
    tenantId: 'telco-uk',
    customerId: 'cust_provenance_probe',
    channel: 'web',
    // Required on `DecisionRequest`. Omitting it produced a trace with no
    // `placement`, which the spec marks required — the API accepted the
    // malformed request rather than refusing it, which is its own small gap.
    placement: 'homepage_hero',
    occurredAt: '2026-09-05T12:00:00.000Z',
    input: {
      customer: {
        age: 40,
        credit_status: 'pass',
        account_status: 'active',
        current_plan: 'sim_only',
        bill_to_income_ratio: 0.02,
        arrears_count_12mo: 0,
      },
      address: { fibre_available: true },
      usage: { pct_of_allowance_3mo_avg: 0.5, months_of_history: 12 },
      contract: { days_to_end: 200 },
      events: { pac_requested_within_days: 999 },
      device: { residual_value: 0 },
      offer: { monthly_delta: 300 },
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
    contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
  };
}
