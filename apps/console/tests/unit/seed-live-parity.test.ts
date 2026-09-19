import { describe, it, expect, beforeAll } from 'vitest';
import { resolveInputs, resolveAggregations, mergeAggregations, type IntegrationGateway } from '@metis/runtime';
import { canonicalise } from '@metis/runtime/deterministic/canonical';
import {
  catalogueSnapshot,
  executeAt,
  requestBeforeResolution,
  recordedAnswers,
  DECISION_COUNT,
} from '@/mocks/fixtures/engine';
import { profileSchema } from '@/mocks/fixtures/profile-schema';

/**
 * A seeded input is what the live path builds from the same request —
 * ADR-022 §8.
 *
 * The seed said it mirrored the live path (`writePath`: "The same walk
 * `resolveInputs` does on the live path. Kept identical on purpose"), and it
 * copied the walk without the precedence: it wrote each connector's answer over
 * the request's own value, where the live path lets the request win. On 8,622
 * of the 10,400 decisions the two disagreed, and the seeded record attributed
 * values to a connector that resolution would not have used.
 *
 * So every seeded decision is rebuilt here the live way, by the live functions
 * — never a copy of their rules, because copying is how the seed diverged:
 * the request as a caller would send it, `resolveInputs` with a gateway
 * answering from the connectors' recorded answers, then `resolveAggregations`
 * and `mergeAggregations`, as the console's route does. The result must be
 * canonically the input the decision was executed with.
 *
 * **What it does not cover.** It holds the seed to the live path's
 * precedence, not to realism. `customer.engagement.digital_or_broadband_intent`
 * is `origin: aggregation` in the schema, nothing declares the aggregation, and
 * the seed puts it in the request; the request wins in both paths, so this
 * passes it. A seeded field the caller could not supply is a different class.
 */

const gatewayFor = (index: number): IntegrationGateway => {
  const answers = recordedAnswers(index);
  return {
    fetch: async (connector) => {
      if (!(connector.id in answers)) throw new Error(`no recorded answer from ${connector.id}`);
      return answers[connector.id];
    },
  };
};

describe('every seeded input is what the live path builds from its request', () => {
  let differ: number[];
  let originsDiffer: number[];

  beforeAll(async () => {
    differ = [];
    originsDiffer = [];
    for (let i = 0; i < DECISION_COUNT; i++) {
      const { request, artifact, trace } = executeAt(i);
      const caller = requestBeforeResolution(i);
      const resolved = await resolveInputs(artifact, catalogueSnapshot.connectors ?? [], caller, gatewayFor(i));
      const rolled = resolveAggregations(profileSchema, resolved.input);
      const live = mergeAggregations(resolved.input, rolled.values);
      if (canonicalise(live) !== canonicalise(request.input)) differ.push(i);
      // And where each value came from: what resolution reports writing is what
      // the decision records, with no `request` entry besides — every
      // connector-provided field in a seeded input arrived from its connector.
      const reported = [...resolved.resolved].sort(
        (a, b) => a.field.localeCompare(b.field) || a.connectorId.localeCompare(b.connectorId) || a.nodeId.localeCompare(b.nodeId)
      );
      if (canonicalise(reported) !== canonicalise(trace.decision.fieldOrigins)) originsDiffer.push(i);
    }
  }, 300_000);

  it('on all 10,400', () => {
    expect(differ.length, `${differ.length} seeded inputs differ from the live path's, e.g. index ${differ[0]}`).toBe(0);
  });

  it('records, on all 10,400, the origins resolution reports', () => {
    expect(
      originsDiffer.length,
      `${originsDiffer.length} seeded decisions record origins resolution does not report, e.g. index ${originsDiffer[0]}`
    ).toBe(0);
  });
});
