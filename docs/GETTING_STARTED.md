# Getting started

The previous version of this guide taught a pipeline that no longer exists: a
`metis compile` CLI over a JSON "Decision IR", with a type checker, a version
resolver and a cost analyser as separate passes. That code was deleted on
2026-09-05 along with thirteen other packages nothing imported. What replaced
it is smaller and actually runs.

This guide is deliberately short, and every code path in it is covered by a
test. Where a test says it better, this points at the test rather than
repeating it — a tutorial that drifts from the code is worse than no tutorial.

---

## Prerequisites

- Node 20+
- Java 17+, only if you want to run the Kotlin engine
- PostgreSQL, only if you want durable registry storage; without it the
  registry runs in memory and its Postgres suite skips

```bash
npm install
```

There is no `npm run build` step to do first. Every package is consumed from
source through path aliases, so the tests and the console run against `.ts`
directly.

---

## Check it works

```bash
npm test
```

That runs six suites in order: the integration seam, the deterministic engine,
the compiler, the registry, the performance gate, and the console's unit
tests. All six must pass before anything else you read here is true.

For the rest:

```bash
npm run test:e2e --prefix apps/console   # console E2E, contract and axe
node scripts/validate-spec.mjs           # the OpenAPI contract
cd engines/kotlin && ./gradlew test      # the second engine, same corpora
```

---

## The pipeline, end to end

Four steps: **author → compile → execute → replay**.

[`tests/integration/pipeline.test.ts`](../tests/integration/pipeline.test.ts)
is the executable version of this section. It builds a two-offer catalogue,
compiles a four-node flow, executes one decision and replays it. Read it
first; it is about 200 lines and it is the shortest true description of the
system.

### Author

A `DecisionFlowSource` is a small DAG — nodes, edges, the candidate keys it may
choose between, and the package ranges it depends on:

```ts
const source: DecisionFlowSource = {
  id: 'next-best-action',
  version: '1.0.0',
  tenantId: 'telco-uk',
  candidateKeys: ['upsell_5g', 'upsell_data'],
  packageRanges: { '@metis/nodes-core': '^1.2.0' },
  nodes: [
    { id: 'source',    type: 'source',         label: 'Profile',     estimatedMs: 4 },
    { id: 'gate',      type: 'filter',         label: 'Eligibility', policyIds: ['pol_age'], estimatedMs: 1 },
    { id: 'score',     type: 'score-model', label: 'Propensity',  model: { id: 'adm', version: '4.2.0' }, estimatedMs: 3 },
    { id: 'arbitrate', type: 'arbitrate',      label: 'Arbitrate',   estimatedMs: 2 },
  ],
  edges: [
    { from: 'source', to: 'gate' },
    { from: 'gate',   to: 'score' },
    { from: 'score',  to: 'arbitrate' },
  ],
};
```

### Compile

```ts
import { compileDecisionFlow } from '@metis/compiler/decision-flow';

const compiled = compileDecisionFlow(source, compileContext);
if (!compiled.ok) console.error(formatReport(compiled.diagnostics));
```

The compiler is the gate, not a formality. It resolves `^1.2.0` to a concrete
version and records it, proves the graph's estimated cost fits the tenant's
latency budget, checks every referenced policy and model exists, and
content-hashes the result. Nothing reaches the runtime without passing it, and
nothing enters the registry without compiling — see
[`packages/registry/src/registry.ts`](../packages/registry/src/registry.ts).

Diagnostics name the fix, not just the fault. `NO_ARBITRATION`,
`ARBITRATION_MISSING_SCORE` and `NO_DELIVERABLE_CREATIVE` each encode a bug
that was previously only findable by running the engine and noticing the output
was empty.

### Execute

```ts
import { execute } from '@metis/runtime';

const trace = execute(artifact, catalogue, request);
trace.decision.winner;   // the chosen action, or null
trace.chainHash;         // what makes the decision quotable
```

The decision splits in two, and the split is the whole design:

- **`trace.decision`** is *reproducible*. Same artifact, same catalogue, same
  input produces byte-identical bytes, on any machine, in any language. It is
  what the chain hash is taken over.
- **`trace.measured`** is *measured*: elapsed milliseconds, cache hits, which
  provider answered. Real, useful, and deliberately outside the hash, because
  a decision that changed identity when a machine was busy would not be
  quotable.

### Replay

```ts
import { replay } from '@metis/runtime';

replay(artifact, catalogue, trace, input).identical;   // true
```

Not a re-run that happens to agree — a byte comparison of the canonical form.
`identical: false` means something that should have been deterministic was not,
and that is a bug in the engine rather than a fact about the decision.

---

## Why the hash means something

Two independent implementations of the serialisation rules in
[ADR-003](adr/ADR-003-canonical-serialisation.md) — TypeScript and Kotlin — are
held to the same committed corpora in [`docs/conformance/`](conformance/):

| Corpus | What it pins |
|---|---|
| `canonical-corpus.json` | 67 cases: how a *value* hashes |
| `decision-corpus.json` | 22 cases: what a *decision* is |
| `service-cases.json` | 60 of the console's real decisions, over HTTP |

CI regenerates all three from the TypeScript reference and fails on any diff,
so a stale corpus cannot silently become the thing being asserted against. A
chain hash means the same thing whichever engine produced it, and that is the
only reason a second engine is worth having.

Both engines are held to it deliberately: changing `Double.toString` to
Kotlin's default broke 25 cases, and making a missing score default to a
neutral value in only one engine broke 13.

---

## The console

```bash
npm run dev --prefix apps/console
```

It reads through [`packages/client`](../packages/client), which is **generated**
from [`docs/metis-api.openapi.yaml`](metis-api.openapi.yaml). Do not hand-edit
it; add the operation to the spec and run `npm run generate`. The console then
fails to compile at every call site that disagrees with the new contract, which
is the point.

Drift is caught in both directions: the compiler catches spec-ahead-of-console,
and `apps/console/tests/e2e/contract.spec.ts` catches console-ahead-of-spec by
asserting every non-`proposed` operation is actually served.

---

## Where to look next

| Question | File |
|---|---|
| What is built, and what only looks built? | [`EXPERIENCE_LAYER_STATUS.md`](EXPERIENCE_LAYER_STATUS.md) |
| What is missing, and why? | [`gaps.md`](gaps.md) |
| Why does the hash work the way it does? | [`adr/ADR-003-canonical-serialisation.md`](adr/ADR-003-canonical-serialisation.md) |
| What does the API actually promise? | [`metis-api.openapi.yaml`](metis-api.openapi.yaml) |
| How fast is it, and under what conditions? | [`bench/harness`](../bench/harness) |
