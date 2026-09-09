import { describe, it, expect } from 'vitest';
import {
  seededOffers,
  seededCreatives,
  seededCandidateKeys,
  GENERATED_OFFER_COUNT,
  BIAS_FLAGGED_INDEX,
} from '@/mocks/fixtures/seed';
import { offers, creatives } from '@/mocks/fixtures/catalogue';
import { auditEvents } from '@/mocks/fixtures/governance';

/**
 * The seeded `demo-telco-uk` tenant has the shape Part 6 of the console spec
 * asks for, and it is measured rather than asserted in prose.
 *
 * Every property here is one of the tells that separates a product from a
 * prototype: a flat value distribution, a catalogue that all appeared last
 * quarter, names like "Test Offer 1". Each is easy to lose in a refactor of the
 * generator and impossible to notice by eye across 240 rows.
 */

describe('the seeded catalogue', () => {
  it('is a catalogue rather than a sample', () => {
    expect(seededOffers).toHaveLength(GENERATED_OFFER_COUNT);
    expect(offers.length).toBeGreaterThanOrEqual(240);
    expect(seededCreatives.length).toBeGreaterThan(300);
    expect(creatives.length).toBeGreaterThan(seededCreatives.length);
  });

  it('gives every offer a distinct id and key', () => {
    expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
    expect(new Set(offers.map((o) => o.key)).size).toBe(offers.length);
  });

  it('names offers like things a telco sells', () => {
    // The spec is explicit: "Unlimited 5G upgrade — existing handset", not
    // "Test Offer 1".
    for (const o of seededOffers) {
      expect(o.name).not.toMatch(/test|sample|example|foo|lorem|offer \d+$/i);
      expect(o.name.length).toBeGreaterThan(8);
      expect(o.name).toMatch(/—/);
    }
    // And they are varied, not one template with a counter.
    const stems = new Set(seededOffers.map((o) => o.name.split('—')[0].trim()));
    expect(stems.size).toBeGreaterThan(20);
  });

  it('concentrates value the way a real catalogue does', () => {
    // Pareto. A flat distribution is the tell that makes a "top offers by
    // margin" panel meaningless, every bar the same height.
    const margins = seededOffers
      .map((o) => o.financials.expectedMargin.amount)
      .sort((a, b) => b - a);
    const total = margins.reduce((a, b) => a + b, 0);
    const topFifth = margins
      .slice(0, Math.floor(margins.length * 0.2))
      .reduce((a, b) => a + b, 0);

    const share = topFifth / total;
    expect(share, `top 20% held ${(share * 100).toFixed(1)}% of margin`).toBeGreaterThan(0.65);
    expect(share).toBeLessThan(0.95);
  });

  it('was written by people, over two years, irregularly', () => {
    const authors = new Set(seededOffers.map((o) => o.updatedBy));
    expect(authors.size).toBeGreaterThan(5);
    for (const a of authors) expect(a).toMatch(/^[a-z]+\.[a-z]+@/);

    const created = seededOffers.map((o) => o.createdAt).sort();
    const span =
      (Date.parse(created[created.length - 1]) - Date.parse(created[0])) / 86_400_000;
    expect(span, 'the catalogue should not all appear at once').toBeGreaterThan(700);

    // Irregular, which means bursty rather than merely non-identical: offers
    // are authored around campaign planning, so some days carry several and
    // most carry none. Evenly spaced dates would put every gap near the median;
    // the test is that the longest quiet stretch dwarfs the typical one.
    const gaps = created
      .slice(1)
      .map((t, i) => Date.parse(t) - Date.parse(created[i]))
      .sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    const longest = gaps[gaps.length - 1];
    expect(longest, 'dates look evenly spaced').toBeGreaterThan(Math.max(median, 1) * 8);
  });

  it('carries offers in every state a screen has to render', () => {
    const byStatus = new Map<string, number>();
    for (const o of seededOffers) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
    for (const s of ['active', 'paused', 'retired']) {
      expect(byStatus.get(s) ?? 0, `no offers are ${s}`).toBeGreaterThan(0);
    }
    // And some with nothing to deliver, which is a real state the console
    // refuses to activate.
    expect(seededOffers.filter((o) => o.creativeIds.length === 0).length).toBeGreaterThan(0);
  });

  it('offers content across every channel a creative can be on', () => {
    const channels = new Set(seededCreatives.map((c) => c.channel));
    expect(channels.size).toBeGreaterThan(3);
    // Every creative belongs to an offer that exists.
    const ids = new Set(seededOffers.map((o) => o.id));
    for (const c of seededCreatives) expect(ids.has(c.offerId)).toBe(true);
  });
});

describe('what a flow will consider', () => {
  it('names only offers that could actually win', () => {
    const byKey = new Map(seededOffers.map((o) => [o.key, o]));
    const deliverable = new Set(seededCreatives.filter((c) => c.active).map((c) => c.offerId));

    for (const objective of ['iss_growth', 'iss_acquisition', 'iss_retention', 'iss_service']) {
      for (const key of seededCandidateKeys(objective)) {
        const offer = byKey.get(key)!;
        expect(offer, `${key} is not a seeded offer`).toBeDefined();
        expect(offer.objectiveId).toBe(objective);
        // The compiler refuses both of these, and it is right to: an offer
        // that is paused or has nothing to deliver cannot be selected, so
        // naming it fills every trace with denials that say nothing.
        expect(offer.status).toBe('active');
        expect(deliverable.has(offer.id)).toBe(true);
      }
    }
  });

  it('is stable across calls, because a demo has to be reproducible', () => {
    expect(seededCandidateKeys('iss_growth')).toEqual(seededCandidateKeys('iss_growth'));
  });

  it('is a subset, not the whole catalogue', () => {
    // Engine cost tracks the candidate set: about 0.6ms per decision at twenty
    // candidates and 5.2ms at two hundred and forty. Across the corpus that is
    // the difference between six seconds and a minute.
    expect(seededCandidateKeys('iss_growth').length).toBeLessThan(40);
  });
});

describe('three things are wrong on purpose', () => {
  it('holds one offer for bias review, and says why on the offer', () => {
    const held = seededOffers.filter((o) => o.tags.includes('bias-review'));
    expect(held).toHaveLength(1);

    const [offer] = held;
    expect(offer).toBe(seededOffers[BIAS_FLAGGED_INDEX]);
    // Paused rather than quietly live, and the reason is on the record rather
    // than in somebody's head.
    expect(offer.status).toBe('paused');
    expect(offer.description).toMatch(/skews by age band/i);
  });

  it('has a churn cohort whose decisions suppress', async () => {
    // Not annotated anywhere — it is a property of the generated population,
    // so it shows up as real suppression in the trace rather than as a label.
    const { decisions } = await import('@/mocks/fixtures/decisions');
    const suppressed = decisions.filter((d) => !d.winner);
    expect(suppressed.length).toBeGreaterThan(decisions.length * 0.2);
    expect(suppressed.length).toBeLessThan(decisions.length * 0.8);
  });

  it('records an incident last week, in the log an incident leaves behind', () => {
    // There is no incidents screen and no Incident schema, so the incident is
    // what one actually leaves on a platform with an append-only audit log.
    const summaries = auditEvents.map((e) => e.summary).join('\n');
    expect(summaries).toMatch(/suppression rate/i);
    expect(summaries).toMatch(/consent registry/i);

    const kinds = auditEvents.map((e) => e.eventType);
    expect(kinds).toContain('AnomalyDetected');
    expect(kinds).toContain('GuardrailBlocked');
    expect(kinds).toContain('IncidentResolved');

    // Detected before it was resolved, which is the only ordering that reads
    // as an incident rather than as four unrelated rows.
    const at = (type: string) =>
      Date.parse(auditEvents.find((e) => e.eventType === type)!.timestamp);
    expect(at('AnomalyDetected')).toBeLessThan(at('IncidentResolved'));
  });
});
