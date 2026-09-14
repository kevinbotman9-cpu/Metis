import { describe, it, expect } from 'vitest';
import { compileDecisionFlow } from '@metis/compiler/decision-flow/compile';
import { artifacts } from '@/mocks/fixtures/artifacts';
import { compileContextFor, toSource } from '@/mocks/fixtures/compiled';
import { store } from '@/mocks/store';
import { GET } from '@/app/api/[...path]/route';

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
      const env = await store.registry.environment('telco-us', a.id, 'production');
      if (env?.activeVersion) live.push(`${a.id}@${env.activeVersion}`);
    }
    expect(live.length, 'nothing is in production; the assertion below would pass over nothing')
      .toBeGreaterThan(0);
  });

  it('compiles every version the registry has in production', async () => {
    await store.registryReady;

    const broken: string[] = [];
    for (const a of artifacts) {
      const env = await store.registry.environment('telco-us', a.id, 'production');
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
    // The screen reads `GET /artifacts`, which compiles each stored draft
    // against the stored catalogue; a publish compiles with `compileContextFor`.
    // The same builder, and this fails if they stop agreeing.
    await store.registryReady;
    const marcus = store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
    const path = ['artifacts', 'telco-us'];
    const res = await GET(
      new Request(`http://localhost/api/${path.join('/')}`, {
        headers: { authorization: `Bearer metis.${marcus.id}` },
      }),
      { params: Promise.resolve({ path }) }
    );
    const list = ((await res.json()) as { artifacts: { id: string; compileOk: boolean }[] }).artifacts;
    expect(list.map((a) => a.id).sort(), 'the flow list shows a different set of flows').toEqual(
      artifacts.map((a) => a.id).sort()
    );

    for (const a of artifacts) {
      const shown = list.find((x) => x.id === a.id)!.compileOk;
      const published = compileDecisionFlow(toSource(a), compileContextFor(a.id));
      expect(
        published.ok,
        `${a.id}: the flow list says ${shown} and a publish would say ${published.ok}`
      ).toBe(shown);
    }
  });

  it('refuses a flow whose candidates cannot be delivered on the channel it serves', async () => {
    // The case this names was `retention-outbound`: it served only
    // `outbound_call`, 18 of its 20 candidates had no active creative on that
    // channel, and it was live anyway — promoted by the registry while
    // `/decision-flows` rendered it red. G-071.
    //
    // That flow is gone with the tenant it belonged to, so the case is built
    // here instead of borrowed from the fixtures. That is the better shape: the
    // guard is a fact about the compiler, and resting it on one tenant
    // happening to carry a broken flow is how it stopped applying the moment
    // that flow was deleted.
    //
    // This tenant's five offers have web, email and SMS content and none at all
    // on push — the brief's app card is not a push notification and there is no
    // channel to author one on (G-090). So judging the live flow against push
    // is a genuine "nothing to deliver" case, with no fixture invented for it.
    await store.registryReady;
    const source = toSource(artifacts.find((a) => a.id === 'next-best-action')!);

    const asPush = compileDecisionFlow(source, {
      ...compileContextFor('next-best-action'),
      servedChannels: ['push'],
    });
    const refused = asPush.diagnostics.filter((d) => d.code === 'NO_DELIVERABLE_CREATIVE');
    expect(
      refused.length,
      'every candidate has push content now; if it was authored, this case needs another channel'
    ).toBeGreaterThan(0);
    expect(asPush.ok, 'a flow that can deliver nothing must not compile').toBe(false);

    // And the flow as actually served does compile, so the refusal above is
    // about the channel and not about the flow being broken in general.
    const asServed = compileDecisionFlow(source, compileContextFor('next-best-action'));
    expect(asServed.ok, 'the live flow must compile under its own served channels').toBe(true);
  });
});