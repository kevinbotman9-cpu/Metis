import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CONSENT_STEP_ID, execute, replay } from '../src/deterministic/engine';
import { assertionOf, consentStateOf, permits } from '../src/deterministic/consent';
import type { CatalogueSnapshot, DecisionRequest, ExecArtifact } from '../src/deterministic/types';

/**
 * Consent fails closed. G-065, ADR-014 §7.1.
 *
 * Until 2026-09-13 a request that stated no consent was decided as though
 * marketing and profiling had been granted, and the decision recorded that
 * substitute under its chain hash. These pin the rule the default broke: what
 * was not stated is absent, absent is enforced as withheld, and the record says
 * absent rather than yes or no.
 *
 * The scenario is the decision corpus's own consent scenario — one commercial
 * scope, one duty-of-care scope — so these assert behaviour on exactly the case
 * both engines are held to, rather than on a second fixture that could drift.
 */

const CORPUS = path.resolve(__dirname, '../../../docs/conformance/decision-corpus.json');
const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8')) as {
  cases: { name: string; artifact: ExecArtifact; catalogue: CatalogueSnapshot; request: DecisionRequest }[];
};
const scenario = corpus.cases.find((c) => c.name === 'withheld consent leaves only service-exempt scopes');
if (!scenario) throw new Error('the decision corpus has no consent scenario to test against');

const decide = (consent: DecisionRequest['consent']) => {
  const request: DecisionRequest = { ...scenario.request, consent };
  if (consent === undefined) delete request.consent;
  return execute(scenario.artifact, scenario.catalogue, request);
};
const denialCodes = (trace: ReturnType<typeof execute>) =>
  trace.decision.eliminations.flatMap((step) => step.denials.map((d) => `${d.key}:${d.code}`)).sort();

describe('a request that states no consent', () => {
  it('absent consent is enforced as withheld and recorded as absent', () => {
    const absent = decide(undefined);
    const withheld = decide({ marketing: false, profiling: false, thirdParty: false });

    expect(absent.decision.consentState).toEqual({ marketing: 'absent', profiling: 'absent', thirdParty: 'absent' });
    // Enforced exactly as withheld: the same candidates removed for the same reason, and the duty-of-care offer kept.
    expect(denialCodes(absent)).toEqual(denialCodes(withheld));
    expect(denialCodes(absent)).toEqual(['offer_b:CONSENT_WITHHELD', 'offer_c:CONSENT_WITHHELD']);
    expect(absent.decision.winner).toBe(withheld.decision.winner);
    // Recorded as itself: absent and withheld are different decisions, so different records.
    expect(absent.chainHash).not.toBe(withheld.chainHash);
  });

  it('is never decided as though consent were given', () => {
    // A stated grant removes nothing for consent — the losers are only NOT_RANKED
    // by arbitration — and saying nothing must not decide the same way.
    const consentDenials = (trace: ReturnType<typeof execute>) =>
      denialCodes(trace).filter((d) => d.endsWith(':CONSENT_WITHHELD'));
    const granted = decide({ marketing: true, profiling: true, thirdParty: false });
    expect(consentDenials(granted)).toEqual([]);
    expect(consentDenials(decide(undefined))).toEqual(['offer_b:CONSENT_WITHHELD', 'offer_c:CONSENT_WITHHELD']);
  });
});

describe('a purpose left out of stated consent', () => {
  it('is absent, not granted', () => {
    const partial = decide({ profiling: true, thirdParty: false });
    expect(partial.decision.consentState).toEqual({ marketing: 'absent', profiling: 'granted', thirdParty: 'withheld' });
    expect(denialCodes(partial)).toEqual(['offer_b:CONSENT_WITHHELD', 'offer_c:CONSENT_WITHHELD']);
  });

  it('is absent when sent as null', () => {
    expect(consentStateOf({ marketing: null, profiling: true })).toEqual({
      marketing: 'absent',
      profiling: 'granted',
      thirdParty: 'absent',
    });
  });
});

describe('the recorded state', () => {
  it('permits only a stated yes', () => {
    expect(permits('granted')).toBe(true);
    expect(permits('withheld')).toBe(false);
    expect(permits('absent')).toBe(false);
  });

  it('turns back into the request that produces it, leaving absent unstated', () => {
    expect(assertionOf({ marketing: 'absent', profiling: 'granted', thirdParty: 'withheld' })).toEqual({
      profiling: true,
      thirdParty: false,
    });
  });

  it('replays an absent-consent decision to the same chain hash', () => {
    const original = decide(undefined);
    const result = replay(scenario.artifact, scenario.catalogue, original, scenario.request.input, scenario.request.contactHistory);
    expect(result.identical).toBe(true);
  });
});

/**
 * Consent is applied to every decision, not only to flows that have a
 * constraint node. G-015.
 *
 * Until 2026-09-13 consent was read only inside a constraint node, so a flow
 * without one decided as though every customer had agreed, and the trace said
 * so only by leaving a step out. Of the 25 corpus flows that rank before any
 * constraint node, 20 would have lost their winner had their requests been
 * decided on the consent they did not send.
 */
describe('a flow with no constraint node', () => {
  const byName = (name: string) => {
    const c = corpus.cases.find((x) => x.name === name);
    if (!c) throw new Error(`the decision corpus has no case named '${name}'`);
    return c;
  };
  const consentSteps = (trace: ReturnType<typeof execute>) =>
    trace.decision.eliminations.filter((s) => s.nodeId === CONSENT_STEP_ID);

  it('has consent applied by the platform, before ranking', () => {
    const c = byName('consent is applied to a flow with no constraint node');
    expect(c.artifact.nodes.some((n) => n.type === 'constraint')).toBe(false);
    const trace = execute(c.artifact, c.catalogue, c.request);
    const steps = trace.decision.eliminations.map((s) => s.nodeId);

    expect(consentSteps(trace)).toHaveLength(1);
    expect(consentSteps(trace)[0].nodeType).toBe('consent');
    expect(denialCodes(trace).filter((d) => d.endsWith(':CONSENT_WITHHELD'))).toEqual([
      'offer_b:CONSENT_WITHHELD',
      'offer_c:CONSENT_WITHHELD',
    ]);
    // Before arbitration, so what ranks is what consent left.
    const arbitrate = c.artifact.nodes.find((n) => n.type === 'arbitrate')!.id;
    expect(steps.indexOf(CONSENT_STEP_ID)).toBeLessThan(steps.indexOf(arbitrate));
    expect(trace.decision.winner).toBe('offer_a');
  });

  it('is decided on absent consent as on withheld', () => {
    const absent = execute(
      byName('absent consent is applied to a flow with no constraint node').artifact,
      byName('absent consent is applied to a flow with no constraint node').catalogue,
      byName('absent consent is applied to a flow with no constraint node').request,
    );
    expect(absent.decision.consentState.marketing).toBe('absent');
    expect(denialCodes(absent).filter((d) => d.endsWith(':CONSENT_WITHHELD'))).toEqual([
      'offer_b:CONSENT_WITHHELD',
      'offer_c:CONSENT_WITHHELD',
    ]);
  });

  it('is not let off by a constraint node that runs after ranking', () => {
    const c = byName('a constraint node after ranking does not stand in for consent');
    const trace = execute(c.artifact, c.catalogue, c.request);
    const steps = trace.decision.eliminations.map((s) => s.nodeId);
    const arbitrate = c.artifact.nodes.find((n) => n.type === 'arbitrate')!.id;
    const constraint = c.artifact.nodes.find((n) => n.type === 'constraint')!.id;

    expect(steps.indexOf(constraint)).toBeGreaterThan(steps.indexOf(arbitrate));
    expect(consentSteps(trace)).toHaveLength(1);
    expect(steps.indexOf(CONSENT_STEP_ID)).toBeLessThan(steps.indexOf(arbitrate));
    expect(consentSteps(trace)[0].denials.map((d) => d.key)).toEqual(['offer_b', 'offer_c']);
  });

  it('records no platform step where a constraint node applies consent first', () => {
    // The flows that were right already decide exactly as they did: no extra step, no moved hash.
    const trace = decide({ marketing: false, profiling: false, thirdParty: false });
    expect(scenario.artifact.nodes.some((n) => n.type === 'constraint')).toBe(true);
    expect(consentSteps(trace)).toEqual([]);
    expect(denialCodes(trace)).toContain('offer_b:CONSENT_WITHHELD');
  });

  it('applies consent before ranking in every corpus decision', () => {
    // Structural, across all of them: whatever the flow declares, the first
    // step that applies consent comes before the first ranking step.
    for (const c of corpus.cases) {
      const trace = execute(c.artifact, c.catalogue, c.request);
      const types = new Map(c.artifact.nodes.map((n) => [n.id, n.type]));
      const steps = trace.decision.eliminations.map((s) => (s.nodeId === CONSENT_STEP_ID ? 'consent' : types.get(s.nodeId)));
      const applied = steps.findIndex((t) => t === 'consent' || t === 'constraint');
      const ranked = steps.indexOf('arbitrate');
      expect(applied, `${c.name}: consent never applied`).toBeGreaterThanOrEqual(0);
      if (ranked >= 0) expect(applied, `${c.name}: ranked before consent`).toBeLessThan(ranked);
    }
  });
});
