import { describe, it, expect } from 'vitest';
import { compileDecisionFlow } from '@metis/compiler/decision-flow/compile';
import { artifacts } from '@/mocks/fixtures/artifacts';
import { compilations, compileContextFor, toSource } from '@/mocks/fixtures/compiled';
import { store } from '@/mocks/store';

/**
 * One question, one answer: does this flow compile?
 *
 * It had three answers until 2026-09-11. The console's view compiled with
 * `servedChannels`, so ADR-012 §B2's channel-aware `NO_DELIVERABLE_CREATIVE`
 * fired; `seedRegistry` published without them, so the same check fell back to
 * *"has an id in `creativeIds`"* and accepted what the console showed as
 * broken; the route built a third context with its own copy of the channel
 * lookup. `retention-outbound` was therefore live — promoted to production by
 * the registry — while `/decision-flows` rendered it red, and it made 3,466
 * decisions of which every one of the 807 offers was undeliverable. G-071.
 *
 * The check that would have caught it is the first one below: what the registry
 * has in production must compile under the context the registry publishes
 * with. Nothing compared those two things, so the disagreement could only be
 * found by noticing that a screen and a database disagreed.
 */
describe('a live flow compiles under the context it was published with', () => {
  it('has something promoted to production, so the check is checking something', async () => {
    await store.registryReady;
    const live: string[] = [];
    for (const a of artifacts) {
      const env = await store.registry.environment('telco-uk', a.id, 'production');
      if (env?.activeVersion) live.push(`${a.id}@${env.activeVersion}`);
    }
    expect(live.length, 'nothing is in production; the assertion below would pass over nothing')
      .toBeGreaterThan(0);
  });

  it('compiles every version the registry has in production', async () => {
    await store.registryReady;

    const broken: string[] = [];
    for (const a of artifacts) {
      const env = await store.registry.environment('telco-uk', a.id, 'production');
      if (!env?.activeVersion) continue;

      const result = compileDecisionFlow(toSource(a), compileContextFor(a.id));
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) {
        broken.push(`${a.id}@${env.activeVersion}: ${errors.length} × ${errors[0].code}`);
      }
    }

    expect(
      broken,
      'a flow is in production that the compiler refuses. Either the context the registry ' +
        'publishes with differs from this one, or the flow stopped compiling after it was ' +
        'published and nothing noticed.'
    ).toEqual([]);
  });

  it('agrees with what the console shows on the flow list', async () => {
    // The screen reads `compilations`; the registry reads `compileContextFor`.
    // They are the same call now, and this fails if they stop being.
    await store.registryReady;

    for (const a of artifacts) {
      const shown = compilations.find((c) => c.artifactId === a.id)!.result;
      const published = compileDecisionFlow(toSource(a), compileContextFor(a.id));
      expect(
        published.ok,
        `${a.id}: the flow list says ${shown.ok} and a publish would say ${published.ok}`
      ).toBe(shown.ok);
    }
  });

  it('keeps the flow that cannot be delivered out of production', async () => {
    // Named rather than left to the loop above, because this is the case that
    // was wrong: `retention-outbound` serves only `outbound_call`, and 18 of
    // its 20 candidates have no active creative on that channel — G-044. It is
    // `retired` in the fixture for that reason, and a test that only asserted
    // "everything in production compiles" would also pass if somebody put it
    // back and authored the eighteen creatives to silence the check.
    await store.registryReady;
    const env = await store.registry.environment('telco-uk', 'retention-outbound', 'production');
    expect(env?.activeVersion, 'retention-outbound is in production again').toBeUndefined();

    // Judged against the channel its slot used to deliver on, which is why it
    // was retired. Its placement is no longer decidable, so the flow's own
    // served-channel set is empty and the channel clause no longer applies —
    // the refusal is a fact about outbound_call, not about the flow in the
    // abstract, and this states it that way rather than relying on a check
    // that stopped firing when the slot was switched off.
    const source = toSource(artifacts.find((a) => a.id === 'retention-outbound')!);
    const asDelivered = compileDecisionFlow(source, {
      ...compileContextFor('retention-outbound'),
      servedChannels: ['outbound_call'],
    });
    const refused = asDelivered.diagnostics.filter((d) => d.code === 'NO_DELIVERABLE_CREATIVE');
    expect(
      refused.length,
      'its candidates can be delivered on outbound_call now; if creatives were authored, say so here'
    ).toBeGreaterThan(0);
  });
});
