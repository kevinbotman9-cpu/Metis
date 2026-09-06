import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactRegistry } from '../src/registry';
import { InMemoryRegistryStore } from '../src/memory-store';
import type { FlowTestResult, FlowTestRunner } from '../src/types';
import { source, context } from './suite';

/**
 * Publishing runs the version's own tests.
 *
 * The compilation gate is why a broken flow cannot reach production, and it
 * only proves the graph is well-formed. Whether the flow still offers what its
 * author said it offers is a different question, and it is the one someone
 * editing a policy is actually changing. §11's aim — change safe enough to
 * hand to a business user — needs both.
 *
 * The runner is injected rather than imported: the registry depends on the
 * compiler and deliberately not on the engine, and reversing that so the store
 * layer could execute decisions would be the wrong direction. These tests
 * supply a stub, because what is under test here is the *gate*, not the
 * engine — `packages/runtime` owns whether a case is evaluated correctly.
 */

const T = 'telco-uk';
const AT = '2026-06-01T12:00:00.000Z';

const withTests = (cases: { name: string }[]) =>
  ({ ...source(), tests: cases }) as ReturnType<typeof source>;

/** Returns whatever it is told to, so the gate can be tested in isolation. */
const stubRunner = (results: FlowTestResult[]): FlowTestRunner => ({
  async run() {
    return results;
  },
});

const pass = (name: string): FlowTestResult => ({ name, passed: true, failures: [] });
const fail = (name: string, why: string): FlowTestResult => ({
  name,
  passed: false,
  failures: [why],
});

describe('the flow-test gate', () => {
  let registry: ArtifactRegistry;

  beforeEach(() => {
    registry = new ArtifactRegistry(new InMemoryRegistryStore());
  });

  const publish = (source: unknown, runner?: FlowTestRunner) =>
    registry.publish(
      {
        tenantId: T,
        flowName: 'inbound-web-offers',
        version: '1.0.0',
        source: source as never,
        actor: 'sarah',
        occurredAt: AT,
      },
      context(),
      runner
    );

  it('publishes a version whose tests pass', async () => {
    const outcome = await publish(withTests([{ name: 'offers fibre to a new customer' }]), stubRunner([pass('offers fibre to a new customer')]));
    expect(outcome.status).toBe('published');
  });

  it('refuses a version whose tests fail, and does not store it', async () => {
    const outcome = await publish(
      withTests([{ name: 'suppresses after three contacts' }]),
      stubRunner([fail('suppresses after three contacts', 'expected no offer, got acq_fibre_900')])
    );

    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.reason).toBe('tests');

    // A refused version must not be in the registry, or it could be promoted.
    expect(await registry.versions(T, 'inbound-web-offers')).toEqual([]);
  });

  it('records the refusal, naming the cases that failed', async () => {
    await publish(
      withTests([{ name: 'suppresses after three contacts' }, { name: 'offers fibre' }]),
      stubRunner([
        fail('suppresses after three contacts', 'expected no offer'),
        pass('offers fibre'),
      ])
    );

    const [event] = await registry.events({ tenantId: T });
    expect(event.type).toBe('PublishRejected');
    // An audit that only shows successes cannot answer whether anyone tried,
    // and one that says "tests failed" without saying which is a worse
    // version of the same problem.
    expect(event.summary).toContain('1 of 2');
    expect(event.summary).toContain('suppresses after three contacts');
  });

  it('refuses a version that attaches tests when no runner was supplied', async () => {
    // The rule that makes this a gate. If a caller could skip the tests by
    // omitting an argument, the first hurried deploy would — and the flow that
    // reached production would be the one whose tests nobody ran.
    const outcome = await publish(withTests([{ name: 'a case' }]));

    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.reason).toBe('tests');

    const [event] = await registry.events({ tenantId: T });
    expect(event.summary).toMatch(/no runner was supplied/);
  });

  it('publishes a version with no tests and no runner, unchanged', async () => {
    // Attaching cases is optional. Making them mandatory would have meant
    // every existing flow becoming unpublishable the day this landed.
    const outcome = await publish(source());
    expect(outcome.status).toBe('published');
  });

  it('stores the results with the version', async () => {
    await publish(
      withTests([{ name: 'offers fibre' }]),
      stubRunner([pass('offers fibre')])
    );

    const [stored] = await registry.versions(T, 'inbound-web-offers');
    // Kept with the version for the same reason warnings are: "it published
    // green" is a different thing to explain in six months than "it published
    // with no tests at all".
    expect(stored.tests).toEqual([pass('offers fibre')]);
  });

  it('does not let a test change the artifact hash', async () => {
    const withoutCases = await publish(source());
    expect(withoutCases.status).toBe('published');
    const hashBefore =
      withoutCases.status === 'published' ? withoutCases.artifact.artifactHash : '';

    // Republishing the same version with a case attached is the same flow. If
    // tests were part of the hash this would be refused as immutable content,
    // which would mean nobody could add a test to a published version.
    const withCase = await publish(
      withTests([{ name: 'offers fibre' }]),
      stubRunner([pass('offers fibre')])
    );

    expect(withCase.status).toBe('unchanged');
    if (withCase.status === 'unchanged') {
      expect(withCase.artifact.artifactHash).toBe(hashBefore);
    }
  });
});
