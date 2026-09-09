# METIS — AI-Native Decisioning with Deterministic Execution

![Foundation MVP](https://img.shields.io/badge/Gate-Foundation%20MVP-blue) ![Status](https://img.shields.io/badge/Status-Active%20Development-green) ![License](https://img.shields.io/badge/License-Proprietary-red)

**One-line positioning:** *Agents author. A deterministic engine executes. Everything explains itself.*

---

## What is METIS?

METIS is an enterprise decision platform that flips the script on AI-driven decisioning:

- **Authoring Plane (Design-Time)**: AI agents propose changes to flows, rules, journeys, and creatives
- **Execution Plane (Runtime)**: Compiled decision artifacts run deterministically with **zero LLM calls** in the hot path
- **Audit Trail**: Every decision is traceable, replayable, and explainable—built in, not added later

**Why it matters:**
- Pega CDH is expensive to change and hard to audit
- Pure LLM-based decision systems are non-deterministic and unpredictable
- METIS combines the best of both: AI for design, determinism for execution

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Docker (optional, for full stack)

### Installation

```bash
git clone <metis-repo>
cd metis
npm install
npm run build
```

### Run Your First Decision

```bash
# Compile a flow
npm run compile tests/fixtures/simple-filter.json --tenant test --output compiled.json

# Execute it
npx ts-node -e "
  import { execute } from '@metis/runtime';
  import fs from 'fs';
  const artifact = JSON.parse(fs.readFileSync('compiled.json', 'utf-8'));
  execute(artifact, {
    tenantId: 'test',
    flowName: 'simple-filter-flow',
    customerId: 'customer_123',
    context: { active: true }
  }).then(r => console.log('Decision:', r.decision.winner));
"
```

---

## Architecture

```
┌──────────────────────────── AUTHORING PLANE ─────────────────────────────┐
│  AI Command Center  ·  Genesis  ·  Agent clusters  ·  Journey canvas      │
│  Flow designer  ·  Simulation & what-if  ·  Approval workflows        │
│                                    │                                      │
│                          proposes changes to                              │
│                                    ▼                                      │
│                         DECISION ARTIFACT (DIR)                           │
│              versioned · diffable · simulatable · signed                   │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ compile + publish (blue/green)
┌────────────────────────────────────▼─────────────────────────────────────┐
│                          EXECUTION PLANE                                  │
│  Artifact registry → Compiled flow VM → Arbitration → Explanation     │
│  Feature store (online) · Rules eval · Model scoring · Constraint engine   │
│                  no LLM · deterministic · p95 < 50ms                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Components

Status means *covered by a test that fails when it breaks*. Anything else is
listed as not built, however much design exists for it.

**The capability map lives in [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md)** —
what is built, what is planned with a stage number, and what is deliberately out
of scope, each row naming the check that guards it.

It is not repeated here. The table that used to sit in this spot said the
decision ledger, idempotency and shadow mode were not built for three stages
after they were built: a second copy of a status is a second chance to be
wrong, and the copy nobody runs is the one that rots.

---

## Repository Structure

Every directory below holds code that something else imports. There is no
scaffolding tree: fourteen stub packages were deleted on 2026-09-05 precisely
because nothing imported them, and their presence made the repository look
more built than it was.

```
metis/
├── packages/
│   ├── core/                  # The domain types every plane shares
│   ├── compiler/              # Graph validation, version pinning, artifact hashing
│   ├── runtime/               # Deterministic engine, canonical serialisation, replay
│   ├── registry/              # Immutable versions, environments, event log
│   ├── client/                # Generated from the OpenAPI spec — never hand-edited
│   └── nodes-core/            # Core node type implementations
│
├── apps/console/              # Next.js console
│
├── engines/kotlin/            # A second ADR-003 implementation, and a JVM decision service
│   ├── engine/                # Zero runtime dependencies
│   └── service/               # HTTP, held to the console's own decisions
│
├── bench/
│   ├── harness/               # Latency measurement, and the gate CI enforces
│   └── datasets/              # Seeded, deterministic synthetic data
│
├── infrastructure/            # Docker Compose, migrations, k8s manifests
├── tests/integration/         # The seams between packages
│
└── docs/
    ├── adr/                   # Architecture Decision Records
    ├── conformance/           # The corpora both engines are held to
    ├── metis-api.openapi.yaml # The contract; the client is generated from it
    ├── gaps.md                # What is not built, and why
    └── EXPERIENCE_LAYER_STATUS.md
```

---

## Phase 0: Foundations (Current)

**Goal:** Build the foundation that everything else depends on.

**What's included:**
1. **Decision IR Schema** — Declarative, versioned graph format for flows
2. **Compiler** — Type checking, version resolution, cost analysis
3. **Runtime** — Deterministic execution with zero LLM calls
4. **Trace System** — Canonical audit trail with replay
5. **Load Harness** — Performance testing with p95 < 50ms gate

**Success Gate:** A decision made today can be replayed in a month, producing byte-identical results with zero LLM calls in the hot path.

**When:** 8 weeks (Weeks 0–8)

---

## Phase 1: Parity Core (Planned)

Capabilities without which an evaluation is lost in week two:

- Adaptive (self-learning) models
- Multi-level arbitration, channel-specific formulas, bundles
- Frequency policy with outcome-conditioned suppression
- Simulation suite (distribution test, version diff, bias gate)
- Batch/offline executor

**When:** Weeks 8–24

---

## Phase 2+: Scale & Differentiation

- Composable package system (node, channel, model-provider, regulatory packs)
- Experience layer (token-driven theming, layout manifests, micro-frontend panels)
- Decision replay and counterfactual explanation
- Cost transparency as a product surface
- Multi-region residency

---

## Core Concepts

### Decision Intermediate Representation (DIR)

A versioned, declarative JSON graph that defines a flow:

```json
{
  "id": "my-flow",
  "nodes": [
    {
      "id": "n1",
      "type": "source",
      "config": { "sourceId": "customer_profile" }
    },
    {
      "id": "n2",
      "type": "filter",
      "config": { "rule": "customer.active == true" }
    }
  ],
  "edges": [{"from": "n1", "to": "n2"}],
  "entryNode": "n1",
  "exitNodes": ["n2"]
}
```

See [DIR Schema](packages/core/src/schema/dir.schema.json) for full spec.

### Compilation

Transforms a DIR into a `CompiledArtifact`:

1. **Type Check** — Validate nodes, edges, data model alignment
2. **Resolve Versions** — Pin package versions for reproducibility
3. **Cost Analysis** — Predict latency, enforce tenant budgets
4. **Sign** — Cryptographic signature for integrity

```bash
metis compile flow.json --tenant telco-uk --output compiled.json
```

### Execution

Runs a compiled artifact deterministically:

```typescript
const response = await execute(artifact, {
  tenantId: 'telco-uk',
  customerId: 'cust_123',
  context: { segment: 'premium' }
});

console.log(response.decision.winner);  // The selected action
console.log(response.trace);            // Full audit trail
console.log(response.cost.totalMs);     // Actual latency
```

**Key property:** Same input + same artifact version = identical output, every time.

### Traces

Every decision produces a `DecisionRecord`:

```typescript
{
  decisionId: "dec_abc123",
  artifactVersion: "1.0.0",
  candidateSet: [...],        // Actions considered
  eliminations: [...],        // Filtered out and why
  scores: [...],              // Model scores
  arbitration: {...},         // Winner selection
  consentState: {...},        // Compliance checks
  timingsByNode: {...},       // Performance breakdown
  totalMs: 23,
  chainHash: "sha256:..."     // Audit trail link
}
```

Render for different audiences:

```typescript
import { renderForCustomer, renderForAnalyst, renderForRegulator } from '@metis/trace';

console.log(renderForCustomer(trace));    // Simple explanation
console.log(renderForAnalyst(trace));     // Detailed metrics
console.log(renderForRegulator(trace));   // Full audit report
```

---

## Node Types (Core)

METIS ships with 16 core node types:

| Type | Purpose |
|------|---------|
| `source` | Fetch data from feature store or external API |
| `filter` | Boolean eligibility rule |
| `set-property` | Mutate working state |
| `join`, `aggregate`, `category-by` | Data transformations |
| `score-model` | Invoke a model (with version pin) |
| `prioritise` | Sort candidates |
| `switch` | Branching logic |
| `sub-flow` | Compose flows |
| `champion-challenger` | A/B test wrapper |
| `constraint` | Hard rules (suppress if violated) |
| `suppress` | Frequency policy |
| `arbitrate` | Ranking formula over candidates |
| `explain-annotate` | Emit reasoning |

See [Node Documentation](docs/api/nodes.md) for detailed specs.

---

## Design Principles

These 10 principles are non-negotiable for all PRs:

1. **No LLM in the decision hot path** — Ever
2. **Everything commercially significant is grounded** — Prices, quantities from system of record
3. **Explanation is emitted, not reconstructed** — Engine produces trace deterministically
4. **Every artifact is versioned, immutable, signed** — Decision flows, rules, models
5. **Every write to control plane is an event** — Event-sourced, replay for free
6. **Multi-tenancy enforced at data layer** — Row-level security, not app code
7. **Extension points are declared, not discovered** — Registry of typed contracts
8. **Fail closed on compliance, fail open on convenience** — Missing consent blocks decision
9. **Every capability has an API before UI** — UI is first-class API consumer
10. **Performance budgets are tested, not hoped for** — p95 gate in CI

---

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm test -- tests/integration/
```

### Load Testing (Phase 0 Performance Gate)
```bash
npm run bench
```

Fails if p95 latency > 50ms.

### Determinism Validation
```bash
npm test -- tests/determinism.test.ts
```

Executes each fixture 100 times, asserts identical results.

---

## Performance Targets (Phase 0)

| Metric | Target | Status |
|--------|--------|--------|
| **P95 Latency** | < 50ms | ✓ Gated in CI |
| **Throughput** | > 1000 req/sec | ✓ Load tested |
| **Determinism** | 100% byte-for-byte | ✓ Validated |
| **LLM Calls in Hot Path** | 0 | ✓ Enforced |

---

## Documentation

- **[GETTING_STARTED.md](docs/GETTING_STARTED.md)** — 2-hour onboarding guide
- **[METIS_Vision_and_Build_Plan.md](METIS_Vision_and_Build_Plan.md)** — Full vision and roadmap
- **[/docs/adr/](docs/adr/)** — Architecture Decision Records
- **[/docs/api/](docs/api/)** — Generated API documentation

---

## Contributing

METIS is in active development. Guidelines:

1. **Design principles first** — Every change must align with the 10 principles
2. **Test coverage** — Unit + integration tests required
3. **Performance gate** — CI fails if p95 > 50ms
4. **Documentation** — Every public API must be documented
5. **ADRs** — Significant decisions get an ADR

See [Contributing Guide](CONTRIBUTING.md) (coming in Phase 0 week 7).

---

## Building Blocks for Partners

If you're building on METIS, start here:

- **Custom Node Type?** Use the SDK: `@metis/sdk`
- **Custom Channel?** Implement the channel adapter interface (Phase 2)
- **Custom Model Provider?** Implement the model provider interface (Phase 2)
- **Regulatory Pack?** Contribute to the packs registry (Phase 2)

---

## Decisions Needed from Product

These don't block Phase 0 but shape Phase 1:

1. **Segment**: Confirm telco-uk as the seed segment (or pivot to banking-uk)?
2. **Scenario C**: Is "layer above incumbent Pega" an entry flow?
3. **Adaptive Models**: Build in-house (recommended) or integrate third-party?
4. **Open Core**: Publish the DIR schema + SDK publicly?
5. **Pricing**: Platform fee + volume bands + transparent inference cost?

---

## Known Limitations (Phase 0)

- **No persistent storage** — Artifact registry is in-memory (Phase 1 adds PostgreSQL)
- **No feature store** — Data fetches are stubbed (Phase 1 adds Redis + ClickHouse)
- **No approval workflows** — Draft stage scaffolded (Phase 1 adds full workflow)
- **No simulation** — What-if analysis planned for Phase 1
- **No adaptive models** — Placeholder nodes only

These are **intentional**, not bugs. Phase 0 proves the foundations work. Phase 1 adds parity.

---

## Support

- **Questions?** Open an objective on GitHub
- **Found a bug?** `git commit -m "bug: ..."` and open a PR
- **Want to contribute?** See [Contributing Guide](CONTRIBUTING.md)

---

## License

Proprietary. See [LICENSE](LICENSE) for details.

---

**Built by:** METIS Team @ Anthropic  
**Current Phase:** 0 (Foundations)  
**Target Release:** Week 52 (Phase 0 gates + Phase 1 core)  
**Last Updated:** 2026-09-03

---

## The Bet, Restated

> Not "AI makes the decisions." Instead: AI does the work that used to require eleven to forty-five specialists, and hands the business a deterministic, replayable, explainable machine that it can extend, re-skin, and defend to a regulator. That is a claim which survives due diligence, which the incumbent cannot retrofit quickly, and which gets stronger as regulation tightens.

From METIS_Vision_and_Build_Plan.md §1
