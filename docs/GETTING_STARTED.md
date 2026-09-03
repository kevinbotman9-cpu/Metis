# METIS Getting Started Guide

Welcome to METIS - AI-native decisioning with deterministic execution.

## Overview

METIS is a two-plane architecture:
- **Authoring Plane**: Agents design strategies at design time
- **Execution Plane**: Compiled deterministic engine executes decisions <50ms with zero LLM calls in the hot path

This guide gets you from zero to a working decision strategy in under 2 hours.

## Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose (for full stack)
- Basic knowledge of TypeScript/JSON

## Installation

### 1. Clone and Install

```bash
git clone <metis-repo>
cd metis
npm install
```

### 2. Build Packages

```bash
npm run build
```

This compiles all TypeScript packages in the monorepo.

### 3. Run Tests

```bash
npm test
```

Verifies the installation and runs unit tests.

## Your First Strategy: Hello Decision

### Step 1: Create a Decision IR

Create a file `my-first-strategy.json`:

```json
{
  "id": "hello-decision",
  "name": "Hello Decision Strategy",
  "version": "1.0.0",
  "description": "A simple strategy that demonstrates the basics",
  "nodes": [
    {
      "id": "source_1",
      "type": "source",
      "label": "Load Data",
      "config": {
        "sourceId": "customer_data",
        "estimatedMs": 5
      },
      "inputs": {
        "customerId": {
          "name": "customerId",
          "type": "string",
          "required": true
        }
      },
      "outputs": {
        "data": {
          "name": "data",
          "type": "object"
        }
      }
    },
    {
      "id": "arbitrate_1",
      "type": "arbitrate",
      "label": "Pick Best Offer",
      "config": {
        "formula": "propensity * value"
      },
      "inputs": {
        "candidates": {
          "name": "candidates",
          "type": "array",
          "required": true
        }
      },
      "outputs": {
        "ranked": {
          "name": "ranked",
          "type": "array"
        },
        "winner": {
          "name": "winner",
          "type": "string"
        }
      }
    }
  ],
  "edges": [
    {
      "from": "source_1",
      "to": "arbitrate_1"
    }
  ],
  "entryNode": "source_1",
  "exitNodes": ["arbitrate_1"],
  "packageDependencies": {
    "@metis/nodes-core": "1.0.0"
  }
}
```

### Step 2: Compile the Strategy

```bash
npm run compile my-first-strategy.json --tenant test --output compiled.json
```

Expected output:
```
✓ Compilation successful
  Artifact ID: hello-decision
  Version: 1.0.0
  Nodes: 2
  Estimated P95 Latency: 10ms
  Models Invoked: none

✓ Compiled artifact written to: compiled.json
```

### Step 3: Execute the Strategy

Create `execute-example.ts`:

```typescript
import { execute } from '@metis/runtime';
import * as fs from 'fs';

async function main() {
  // Load compiled artifact
  const compiledContent = fs.readFileSync('compiled.json', 'utf-8');
  const compiled = JSON.parse(compiledContent);
  
  // Execute
  const response = await execute(compiled, {
    tenantId: 'test',
    strategyName: 'hello-decision',
    customerId: 'customer_123',
    context: {
      segment: 'premium',
      active: true,
    },
  });

  console.log('Decision:', response.decision.winner);
  console.log('Trace:', response.trace);
  console.log('Latency:', response.cost.totalMs, 'ms');
}

main().catch(console.error);
```

Run it:
```bash
npx ts-node execute-example.ts
```

## Understanding the Architecture

### Decision Intermediate Representation (DIR)

The DIR is a declarative JSON graph that defines a decision strategy:

- **Nodes**: Decision operations (source, filter, score, arbitrate, etc.)
- **Edges**: Connections between nodes
- **Entry/Exit**: Where execution begins and ends

Example node types:

```json
{
  "type": "source",      // Fetch data
  "type": "filter",      // Boolean eligibility rule
  "type": "score-model", // Invoke a model
  "type": "arbitrate",   // Ranking formula
  "type": "constraint",  // Hard rules
  "type": "switch",      // Branching logic
}
```

### Compilation

The compiler performs three critical tasks:

1. **Type Checking**: Validates node connectivity and schemas
2. **Version Resolution**: Pins package versions for reproducibility
3. **Cost Analysis**: Predicts latency and enforces tenant budgets

Result: A `CompiledArtifact` that the runtime can execute deterministically.

### Execution

The runtime:

1. Loads the compiled artifact
2. Executes nodes in topological order
3. Emits a `DecisionTrace` as a side effect
4. Returns decision + trace + cost metrics

**Key property**: Same input + same artifact version = identical output, every time.

## How Traces Work

Every decision produces a trace showing:

- **Candidates Considered**: All actions that entered the strategy
- **Eliminations**: Which candidates were filtered out and why
- **Scores**: Model scores for each candidate
- **Arbitration**: How the winner was selected
- **Chain Hash**: Audit trail link to previous decision

Access the trace:

```typescript
// Customer-friendly (minimal info)
console.log(renderForCustomer(response.trace));

// Analyst-friendly (metrics)
console.log(renderForAnalyst(response.trace));

// Engineer (full JSON)
console.log(renderForEngineer(response.trace));

// Regulator (audit trail)
console.log(renderForRegulator(response.trace));
```

## Testing Your Strategy

### Run the Built-in Tests

```bash
npm test -- tests/integration/compile-and-execute.test.ts
```

This tests compilation, execution, and determinism.

### Load Testing

```bash
npm run bench
```

Measures latency and throughput. Fails if p95 > 50ms.

## Node Types Reference

| Node | Purpose | Inputs | Output |
|------|---------|--------|--------|
| `source` | Fetch data | customerId | data object |
| `filter` | Eligibility rule | value | pass (bool) + reason |
| `score-model` | Model scoring | features | score, confidence |
| `arbitrate` | Rank candidates | candidates array | ranked, winner |
| `constraint` | Hard rules | candidates | filtered candidates |
| `switch` | Branching | value | branch ID |
| `set-property` | Mutate state | object | modified object |

Full documentation in `/docs/api/nodes.md`.

## Debugging

### Check Compilation Errors

```bash
npm run compile strategy.json --tenant test 2>&1 | grep -A5 "Error"
```

### Inspect a Trace

```typescript
console.log(JSON.stringify(response.trace, null, 2));
```

Look for:
- `eliminations`: Why candidates were filtered
- `timingsByNode`: Where time was spent
- `complianceChecks`: Audit and consent status

### Replay a Decision

```typescript
const decision = await execute(artifact, { ... });
// Later, ask: what was this decision?
const replayed = await replay(decision.decisionId);
```

Produces byte-identical result.

## Next Steps

1. **Build a Real Strategy**: Replace the toy example with a telco/banking/insurance use case
2. **Add Models**: Use `score-model` node to invoke models
3. **Test at Scale**: Run the load harness with realistic volume
4. **Explore Simulation**: Phase 1 adds what-if analysis

## FAQ

**Q: How do I add a custom node type?**  
A: Create a package implementing the `BaseNode` interface. See `/packages/nodes-core/src` for examples.

**Q: Can I modify a strategy after it's live?**  
A: Publish a new version. Blue/green deployment switches instantly. Rollback is one click.

**Q: How do I ensure GDPR/compliance?**  
A: Use `constraint` nodes + consent tracking in the trace. Regulatory packs are coming in Phase 1.

**Q: What's the performance target?**  
A: p95 < 50ms at 1000 req/sec per tenant. Load gate fails if you exceed it.

## Getting Help

- **API Docs**: `npm run build && open docs/api/index.html`
- **Architecture**: See `/docs/adr/` for design decisions
- **Examples**: `/tests/fixtures/` has sample strategies
- **Chat**: Open an issue on GitHub

## Success Checklist

- [ ] Installation complete (`npm install && npm run build` works)
- [ ] First strategy compiles (`npm run compile my-first-strategy.json`)
- [ ] First strategy executes (`npx ts-node execute-example.ts`)
- [ ] Trace is readable (render functions work)
- [ ] Tests pass (`npm test`)
- [ ] Load test shows p95 < 50ms

Once all ✓, you're ready to build real strategies.

---

**Prepared by:** METIS Team  
**For Phase 0:** Foundations  
**Last Updated:** 2026-09-03
