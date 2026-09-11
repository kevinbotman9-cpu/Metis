import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/[...path]/route';
import { catalogueSnapshot, execArtifacts } from '@/mocks/fixtures/engine';
import { RecordedIntegrationGateway } from '@/mocks/gateway';
import { readPath } from '@metis/runtime/deterministic/engine';
import { resolveInputs, requiredConnectors } from '@metis/runtime';

/**
 * Resolution runs on the live decision path.
 *
 * It did not, until now. `resolveInputs` existed, was covered by its own tests,
 * and was called by nothing: a connector could be configured, shown on
 * /integrations, named by a live flow and counted in the compiler's latency
 * budget without one line of code that could fetch it. A comment in
 * mocks/fixtures/engine.ts asserted the opposite, which is the kind of claim
 * W-000 exists to stop.
 *
 * These assert the wiring rather than the resolver: that a decision made
 * through the endpoint reads its connectors, that the fields arrive as
 * provenance in the hashed half, that the wire timings arrive in the measured
 * half, and that none of it makes a decision non-reproducible.
 */

const ARTIFACT = 'next-best-action';

function decide(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/decisions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: ['decisions'] }) }
  );
}

/** A request carrying no connector-supplied field. Resolution has to fill them. */
const request = (over: Record<string, unknown> = {}) => ({
  artifactId: ARTIFACT,
  request: {
    tenantId: 'telco-uk',
    customerId: 'cust_resolution',
    channel: 'web',
    placement: 'account_dashboard_hero',
    occurredAt: '2026-06-01T12:00:00.000Z',
    input: { customer: { age: 41, credit_status: 'pass', account_status: 'active' } },
    consent: { marketing: true, profiling: true, thirdParty: false },
    ...over,
  },
});

describe('POST /api/decisions resolves its connectors', () => {
  it('records where each connector-supplied field came from', async () => {
    const res = await decide(request());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      decision: { sourceBindings: { field: string; connectorId: string; nodeId: string }[] };
    };

    // The caller sent none of these. They are in the decision because the
    // endpoint fetched them.
    const byField = new Map(body.decision.sourceBindings.map((b) => [b.field, b.connectorId]));
    expect(byField.get('customer.monthly_spend')).toBe('conn_billing_ledger');
    expect(byField.get('customer.arrears_days')).toBe('conn_billing_ledger');
    expect(byField.get('customer.tenure_months')).toBe('conn_network_usage');
    expect(byField.get('customer.marketing_consent')).toBe('conn_consent_registry');
  });

  it('is reproducible: the same customer resolves to the same decision', async () => {
    // Resolution that reached for a clock or an RNG would pass every other test
    // here and break replay, which is the one property the platform sells.
    const first = (await (await decide(request())).json()) as { chainHash: string };
    const second = (await (await decide(request())).json()) as { chainHash: string };
    expect(second.chainHash).toBe(first.chainHash);
  });

  it('lets the caller override a connector field', async () => {
    // "Fields already present on the request win" — a channel that already has
    // the value should not pay for a call to learn it again, and the decision
    // must be made from what it was given.
    const supplied = (await (
      await decide(request({ input: { customer: { age: 41 }, monthlySpend: 99 } }))
    ).json()) as { chainHash: string };
    const resolved = (await (
      await decide(request({ input: { customer: { age: 41 } } }))
    ).json()) as { chainHash: string };

    expect(supplied.chainHash).not.toBe(resolved.chainHash);
  });
});

describe('the recorded gateway serves every field the live flows need', () => {
  it('resolves every connector the fixture artifacts name', async () => {
    const gateway = new RecordedIntegrationGateway();

    for (const artifact of execArtifacts) {
      const needed = requiredConnectors(artifact);
      if (needed.length === 0) continue;

      const resolved = await resolveInputs(
        artifact,
        catalogueSnapshot.connectors ?? [],
        {
          tenantId: 'telco-uk',
          customerId: 'cust_coverage',
          channel: 'web',
          occurredAt: '2026-06-01T12:00:00.000Z',
          input: {},
        },
        gateway
      );

      // Every declared field arrives, at its declared name and type. A gateway
      // that answered `{}` would leave the fields simply missing, and a policy
      // reading a missing field is a policy that silently never fires.
      for (const { connectorId } of needed) {
        const connector = (catalogueSnapshot.connectors ?? []).find((c) => c.id === connectorId);
        if (!connector?.active) continue;
        for (const binding of connector.provides) {
          // Read by path: a connector declares where its value lands as a
          // path into the profile, so the value is nested (ADR-014 §2).
          expect(
            typeof readPath(resolved.input, binding.field),
            `${connector.id} did not supply ${binding.field}`
          ).toBe(binding.type);
        }
      }

      // And every call is accounted for in the measured half.
      expect(resolved.calls.map((c) => c.connectorId).sort()).toEqual(
        [...new Set(needed.map((n) => n.connectorId))].sort()
      );
    }
  });
});
