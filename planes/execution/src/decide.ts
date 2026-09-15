import { assignAll } from '@metis/core/experiment';
import type { DecisionLedger } from '@metis/ledger';
import {
  IdempotencyConflict,
  IntegrationError,
  mergeAggregations,
  resolveAggregations,
  resolveInputs,
  type DecisionRecord,
  type IntegrationGateway,
} from '@metis/runtime';
import { execute } from '@metis/runtime/deterministic/engine';
import type { DecisionRequest, ExecArtifact } from '@metis/runtime/deterministic/types';
import type { LoadedTenant } from './state';

export interface DecideDeps {
  ledger: DecisionLedger;
  gateway: IntegrationGateway;
  /** The wall clock, for bookkeeping only — never an input to a decision. */
  now: () => string;
}

export type DecideOutcome =
  | { kind: 'error'; status: number; body: Record<string, unknown> }
  | { kind: 'replay'; record: DecisionRecord }
  | { kind: 'decided'; record: DecisionRecord };

/**
 * Make one decision and write it down, or say why not.
 *
 * The console's `decideAndRecord` and `resolveAndExecute`
 * (`apps/console/app/api/[...path]/route.ts`), built only on packages, in the
 * same order and for the same reasons:
 *
 * 1. Idempotency first, through the ledger — a retry answered from the ledger
 *    must not pay for an integration call, and a conflicting key must not have
 *    a decision made for it at all.
 * 2. Integrations, then declared rollups, then experiment arms, each entering
 *    the hashed input before the deterministic core runs.
 * 3. The engine.
 * 4. The record, written synchronously before answering: a decision the
 *    platform made and cannot produce afterwards is worse than one it failed
 *    to make.
 * 5. The idempotency claim, taking whichever claim the store kept.
 *
 * The console also starts a shadow here. The service does not yet: shadow
 * belongs with the promotion path it compares, which is a later unit.
 */
export async function decide(
  deps: DecideDeps,
  tenant: LoadedTenant,
  artifact: ExecArtifact,
  request: DecisionRequest
): Promise<DecideOutcome> {
  const resolved = await deps.ledger.resolve(request);

  if (resolved.kind === 'conflict') {
    const e = new IdempotencyConflict(
      request.idempotencyKey as string,
      resolved.storedHash,
      resolved.attemptedHash
    );
    return { kind: 'error', status: 409, body: { error: 'idempotency_conflict', message: e.message } };
  }
  if (resolved.kind === 'replay') {
    // The original decision, not a re-execution that happens to agree.
    return { kind: 'replay', record: resolved.entry.record };
  }

  let inputs;
  try {
    inputs = await resolveInputs(artifact, tenant.snapshot.connectors ?? [], request, deps.gateway);
  } catch (e) {
    if (e instanceof IntegrationError) {
      // A connector configured to fail closed failed: the flow and the request
      // are fine, a dependency is not, and a caller can retry.
      return {
        kind: 'error',
        status: 503,
        body: {
          error: 'integration_failed',
          message: e.message,
          connectorId: e.connectorId,
          outcome: e.outcome,
        },
      };
    }
    throw e;
  }

  // Declared rollups, when the tenant has a model to declare them in. An
  // absent collection produces nothing rather than zero.
  const rolled = tenant.record.profileSchema
    ? resolveAggregations(tenant.record.profileSchema, inputs.input)
    : { values: {} };

  // Arms are a pure function of the customer reference, so nothing is stored.
  const arms = assignAll(tenant.record.experiments, request.customerId);

  const resolvedRequest: DecisionRequest = {
    ...request,
    input: {
      ...mergeAggregations(inputs.input, rolled.values),
      ...(Object.keys(arms.values).length > 0
        ? { experiments: Object.fromEntries(arms.assignments.map((a) => [a.experimentKey, a.arm])) }
        : {}),
    },
  };

  const record = execute(artifact, tenant.snapshot, resolvedRequest);
  // Measured, never hashed: what the wire cost is not part of what was decided.
  if (inputs.calls.length > 0) record.measured.sourceCalls = inputs.calls;

  await deps.ledger.record(deps.ledger.entryFor(record, request.tenantId));

  const key = request.idempotencyKey;
  if (key) {
    const claimed = await deps.ledger.claim({
      tenantId: request.tenantId,
      key,
      requestHash: resolved.hash,
      decisionId: record.id,
      storedAt: deps.now(),
    });
    // The store decides which claim wins a race; use what it kept.
    if (claimed.decisionId !== record.id) {
      const winner = await deps.ledger.get(request.tenantId, claimed.decisionId);
      if (winner) return { kind: 'replay', record: winner.record };
    }
  }

  return { kind: 'decided', record };
}
