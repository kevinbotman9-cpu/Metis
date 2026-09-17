import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GET as ROUTE_GET, POST as ROUTE_POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { seedLedger } from '@/mocks/seed-ledger';
import { provenanceFor, provenanceOver } from '../../mocks/provenance';
import { effectiveDataClass, SUBJECT_PROTECTION } from '@metis/ledger';

/**
 * A synthetic number says so, wherever it goes.
 *
 * The seeded `demo-telco-us` tenant became indistinguishable from real
 * reporting on 2026-09-09. 10,400 decisions, 1,228 measured outcomes, click
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
 *
 * **What decides the label, since ADR-018 §8.** The ledger's data class. Until
 * slice 3 a decision was synthetic if its id was in the committed index and
 * recorded if it was not, so "recorded" meant "not in a file" — and a reviewer
 * who made a decision in the console turned the performance report `mixed`.
 * The index is deleted, `effectiveDataClass` answers `synthetic` for every
 * ledger while the subject is unprotected (G-068), and so every figure reads
 * synthetic, including one the reviewer just made. That is a truthful label
 * for a store holding customer references in clear with no erasure path, and
 * the slice that changes it is "Protect the subject in the ledger".
 */

/** A seeded decision to ask about, written the way the console's own seed does. */
let seededId: string;


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

describe('provenance is the ledger’s data class, not a membership test', () => {
  it('calls every decision synthetic, the ones nobody seeded included', () => {
    // The change ADR-018 §8 warned would surprise whoever wrote the old tests:
    // an id the seed never produced is synthetic too, because the ledger it
    // would be written to cannot be real.
    expect(provenanceFor('telco-us', seededId).source).toBe('synthetic');
    expect(provenanceFor('telco-us', 'dec_definitely_not_seeded').source).toBe('synthetic');
    expect(provenanceFor('telco-us', 'dec_live_one').source).toBe('synthetic');
  });

  it('carries the count, and nothing is recorded while the subject is unprotected', () => {
    const p = provenanceOver('telco-us', [seededId, 'dec_live_one', 'dec_another'])!;
    expect(p.source).toBe('synthetic');
    expect(p.syntheticCount).toBe(3);
    expect(p.recordedCount).toBe(0);
    // The note has to stand alone in a file somebody opens months later.
    expect(p.note).toMatch(/[Nn]ot evidence/);
  });

  it('names the tenant the response is for, not one typed into a string', () => {
    // It named `demo-telco-us` until 2026-09-17, a tenant renamed on 2026-09-12,
    // under a tenant switcher reading `telco-us`. Two different tenants here,
    // so a constant that happened to match one of them cannot pass.
    expect(provenanceOver('telco-us', ['dec_a'])!.note).toMatch(/\btelco-us\b/);
    expect(provenanceOver('telco-eu', ['dec_a'])!.note).toMatch(/\btelco-eu\b/);
    expect(provenanceFor('telco-eu', 'dec_a').note).toMatch(/\btelco-eu\b/);
    expect(provenanceOver('telco-us', ['dec_a'])!.note).not.toMatch(/demo-telco-us/);
  });

  it('claims no origin it cannot know', () => {
    // "Generated from a fixed seed" was true of the seeded corpus and false of
    // every decision made since, and nothing persists whether a seed ran. The
    // note names both origins that can exist and asserts neither.
    const note = provenanceOver('telco-us', ['dec_a'])!.note;
    expect(note).not.toMatch(/Every figure here is generated from a fixed seed/);
    expect(note).toMatch(/fixed seed or made by using the demo/);
  });

  it('says nothing at all when there is nothing to describe', () => {
    // Until 2026-09-17 this returned counts of zero *and the full note*, so an
    // empty tenant's screens carried a banner asserting a seed that had not
    // run, over figures that did not exist. This test was already named "says
    // nothing" and only checked the counts, which is how the note got through.
    expect(provenanceOver('telco-us', [])).toBeUndefined();
    // And the key is absent from the JSON, not present as null: `curl` shows
    // no claim, which is the standard this module holds a marker to.
    expect(JSON.stringify({ decisions: [], provenance: provenanceOver('telco-us', []) })).toBe(
      '{"decisions":[]}'
    );
  });

  it('is the refusal G-068 describes, not a constant somebody typed', () => {
    // If this ever reads 'per-subject-key', the data class becomes a real
    // question again and `mixed` may come back — which is the point of
    // deriving the label rather than hard-coding it.
    expect(SUBJECT_PROTECTION).toBe('none');
    expect(effectiveDataClass()).toBe('synthetic');
    expect(effectiveDataClass({ ...process.env, METIS_DATA_CLASS: 'real' })).toBe('synthetic');
  });
});

describe('every response derived from the seed carries its provenance', () => {
  beforeEach(async () => {
    await resetStore();
    // A history to ask about. The reports read the ledger alone now, so a
    // store that never seeded has nothing to be synthetic about — which is
    // its own test, in `seeded-ledger.test.ts`.
    await store.ledgerReady;
    // Three hundred, not forty: outcomes land on about an eighth of the
    // decisions that deliver, and a history too small to contain one cannot
    // show that an outcome carries its provenance.
    await seedLedger(store.ledger, { count: 300 });
    seededId = (await store.ledger.query({ tenantId: 'telco-us', limit: 1 }))[0].decisionId;
  });

  it('marks the decision search', async () => {
    const body = await GET(['decisions', 'search'], { limit: '25' });
    expect(body.provenance, 'the grid is the most-read synthetic surface').toBeDefined();
    expect(body.provenance.source).toBe('synthetic');
    expect(body.provenance.note).toMatch(/no real customer/);
  });

  it('marks a seeded trace', async () => {
    const body = await GET(['decisions', seededId, 'trace']);
    expect(body.provenance.source).toBe('synthetic');
  });

  it('marks the performance report, and keeps saying synthetic after somebody clicks', async () => {
    const before = await GET(['performance', 'telco-us']);
    expect(before.provenance.source).toBe('synthetic');
    expect(before.provenance.syntheticCount).toBe(300);

    // A live decision through the API — exactly what a reviewer clicking the
    // storefront produces. It joins the same ledger and carries the same
    // label: the report counts one more decision and stays synthetic, because
    // the store it landed in cannot be real (ADR-018 §8).
    const made = await POST(['decisions'], {
      artifactId: 'next-best-action',
      request: liveRequest(),
    });
    expect(made.decision?.id ?? made.id, JSON.stringify(made).slice(0, 200)).toBeTruthy();

    const after = await GET(['performance', 'telco-us']);
    expect(after.provenance.source).toBe('synthetic');
    expect(after.provenance.syntheticCount).toBe(301);
    expect(after.provenance.recordedCount).toBe(0);
    expect(after.provenance.note).not.toMatch(/Mixed/);
  });

  it('marks the outcomes of a seeded decision that has some', async () => {
    // A real loop: `find` with an async predicate matches the first element
    // whatever it holds, because a promise is truthy.
    let withOutcomes: string | undefined;
    for (const e of await store.ledger.query({ tenantId: 'telco-us', limit: 5000 })) {
      if ((await store.ledger.outcomesFor('telco-us', e.decisionId)).length > 0) {
        withOutcomes = e.decisionId;
        break;
      }
    }
    expect(withOutcomes, 'the seeded history gave nobody an outcome').toBeDefined();

    const body = await GET(['outcomes', 'telco-us', withOutcomes!]);
    expect(body.outcomes.length).toBeGreaterThan(0);
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
    tenantId: 'telco-us',
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
        credit_band: 'A',
        address: { fiber_available: true },
        usage: { pct_of_allowance_3mo_avg: 0.5, months_of_history: 12 },
        contract: { days_to_end: 200 },
        events: { pac_requested_within_days: 999 },
        device: { residual_value: 0 },
      },
      context: { offer: { monthly_delta: 300 } },
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
    contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
  };
}
