import { execute } from '../deterministic/engine';
import type {
  CatalogueSnapshot,
  DecisionRequest,
  ExecArtifact,
  ReasonCode,
} from '../deterministic/types';

/**
 * Test cases a flow author attaches to a flow version.
 *
 * §11 wants change safe enough to hand to a business user. The registry
 * already refuses a flow that does not compile — that gate is why a broken
 * flow cannot reach production. Compilation only proves the graph is
 * well-formed, though: it says nothing about whether the flow still offers
 * what it is supposed to offer, and that is the change an author is actually
 * making when they edit a policy.
 *
 * So a version can carry cases, and publishing runs them. A flow that no
 * longer does what its author said it does is refused, recorded, and never
 * reaches an environment.
 *
 * **These are not part of the artifact hash.** A test does not change how a
 * flow decides, and treating an added test as new content would mean either a
 * version bump for no behavioural change or a refusal to add tests to an
 * existing version. Both are worse than the alternative, which is that the
 * results are stored with the version and the artifact stays what it was.
 */

export interface FlowTestExpectation {
  /**
   * The offer key expected to win, or null for "nothing should be offered".
   *
   * Null is the case worth writing most often and the one people forget: a
   * suppression rule that stopped working fails silently, because the flow
   * still returns something.
   */
  winner?: string | null;
  /**
   * Keys that must be *ruled out*, not merely beaten.
   *
   * `NOT_RANKED` is excluded from this check deliberately. The engine records
   * it against every candidate that reached arbitration and lost, so matching
   * it here would make `denied` true for almost any non-winner — an assertion
   * that cannot fail, which is worse than no assertion. An author who really
   * means "came second" can say so with `reasonCodes: ['NOT_RANKED']`.
   */
  denied?: string[];
  /** Reason codes that must appear among the denials. */
  reasonCodes?: ReasonCode[];
}

export interface FlowTestCase {
  name: string;
  /** The request, minus the tenant and artifact the runner already knows. */
  request: Omit<DecisionRequest, 'tenantId'>;
  expect: FlowTestExpectation;
}

export interface FlowTestResult {
  name: string;
  passed: boolean;
  /** Empty when it passed. One entry per unmet expectation, not just the first. */
  failures: string[];
}

/**
 * Runs cases against a compiled flow.
 *
 * Injected into `registry.publish` rather than imported by it: the registry
 * depends on the compiler and deliberately not on the engine, and reversing
 * that to run tests would make the store layer depend on execution. The caller
 * supplies this because the caller is what already has both.
 */
export interface FlowTestRunner {
  run(artifact: ExecArtifact, tests: FlowTestCase[]): Promise<FlowTestResult[]>;
}

export function createFlowTestRunner(catalogue: CatalogueSnapshot): FlowTestRunner {
  return {
    async run(artifact, tests) {
      return tests.map((test) => runOne(artifact, catalogue, test));
    },
  };
}

function runOne(
  artifact: ExecArtifact,
  catalogue: CatalogueSnapshot,
  test: FlowTestCase
): FlowTestResult {
  const failures: string[] = [];

  let record;
  try {
    record = execute(artifact, catalogue, {
      ...test.request,
      tenantId: artifact.tenantId,
    } as DecisionRequest);
  } catch (e) {
    // A case that makes the engine throw is a failure, not a crash of the
    // publish. The author gets told which case and why.
    return {
      name: test.name,
      passed: false,
      failures: [`the engine threw: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const decision = record.decision;

  if ('winner' in test.expect) {
    const expected = test.expect.winner ?? null;
    const actual = decision.winner ?? null;
    if (actual !== expected) {
      failures.push(
        `expected ${expected === null ? 'no offer' : expected} to win, got ` +
          `${actual === null ? 'no offer' : actual}`
      );
    }
  }

  const denials = decision.eliminations.flatMap((step) => step.denials);
  const ruledOut = denials.filter((d) => d.code !== 'NOT_RANKED');

  for (const key of test.expect.denied ?? []) {
    if (!ruledOut.some((d) => d.key === key)) {
      const lost = denials.some((d) => d.key === key);
      failures.push(
        lost
          ? `expected ${key} to be ruled out, and it reached arbitration and lost instead`
          : `expected ${key} to be ruled out, and it was not`
      );
    }
  }

  for (const code of test.expect.reasonCodes ?? []) {
    if (!denials.some((d) => d.code === code)) {
      const seen = [...new Set(denials.map((d) => d.code))].sort();
      failures.push(
        `expected a ${code} denial; the codes seen were ${seen.length ? seen.join(', ') : 'none'}`
      );
    }
  }

  return { name: test.name, passed: failures.length === 0, failures };
}
