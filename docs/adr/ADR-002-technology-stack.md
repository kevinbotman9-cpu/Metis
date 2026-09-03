# ADR-002: Technology Stack

**Status:** Accepted  
**Date:** 2026-09-03

## Context

METIS needs to build:
1. A compiler (type checking, version resolution, cost analysis)
2. A deterministic runtime (sub-50ms, zero LLM calls)
3. A control plane (artifact registry, approval workflows, audit)
4. A feature store and analytics (online + offline)

## Decision

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Compiler** | TypeScript + Node.js | Strong type system, AST tooling, easy to build DSLs |
| **Runtime (hot path)** | WASM (via AssemblyScript or compiled Go) | Deterministic, fast (<50ms), portable |
| **Runtime (orchestration)** | TypeScript + Node.js | Same language as compiler, easier integration |
| **Control Plane DB** | PostgreSQL | Transactional, JSONB support, row-level multi-tenancy |
| **Audit Log** | EventStoreDB | Append-only, event sourcing, built for audit trails |
| **Feature Store (online)** | Redis | Sub-ms latency, TTL support, cluster-ready |
| **Analytics (offline)** | ClickHouse | Time-series optimized, column storage, cost-effective at scale |
| **Package Format** | npm-style (semver) | Familiar to JavaScript/Node ecosystem |

## Reasoning

### Compiler: TypeScript
- Expressive type system for schema validation
- JSON Schema tooling mature in Node ecosystem
- Can generate OpenAPI specs and docs automatically
- Monorepo support with TypeScript project references

### Runtime: WASM + TypeScript
- **WASM** for the hot path: deterministic bytecode, portable, fast
- **TypeScript** for orchestration: feature fetch, trace collection, state management
- Avoids runtime ambiguity (Python GIL, Node event loop) in decision execution
- Can be compiled offline, no runtime dependencies

### PostgreSQL + EventStoreDB
- PostgreSQL for current state (artifact registry, tenant configs)
- EventStoreDB for event log (who changed what, when, why)
- CQRS pattern: commands mutate the log, queries read the projection
- Enables replay and audit trail

### Redis + ClickHouse
- Redis for sub-millisecond feature reads (decision hot path)
- ClickHouse for history and analytics (not in the hot path)
- Avoids single database that would bottleneck at scale

## Consequences

### Positive
- **Performance**: WASM + Redis enables <50ms p95 latency
- **Determinism**: WASM bytecode execution is reproducible
- **Composability**: npm package model familiar to the ecosystem
- **Auditability**: EventStoreDB gives us replay for free
- **Ecosystem**: Mature tooling for each component

### Negative
- **Complexity**: Building a WASM compiler adds engineering work
- **Learning curve**: Developers need to understand WASM constraints
- **Operations**: Running PostgreSQL + EventStoreDB + Redis + ClickHouse is more complex than a single monolithic database

## Migration Path

- **Phase 0**: In-memory stubs for registry, event log, feature store (validate concepts)
- **Phase 1**: Add PostgreSQL for persistent artifact registry
- **Phase 2**: Add EventStoreDB for audit trail, CQRS projection
- **Phase 3**: Add Redis + ClickHouse for scale testing

## Alternatives Considered

### Alternative A: Python + FastAPI
- ✗ GIL makes concurrency unpredictable
- ✗ No native WebAssembly support
- ✓ Good for data science, but not deterministic execution

### Alternative B: Go
- ✓ Deterministic, fast, good concurrency
- ✗ Weaker type system than TypeScript
- ✗ Smaller JavaScript ecosystem integration

### Alternative C: Single Database (PostgreSQL + JSONB)
- ✓ Simpler operations (one database)
- ✗ Can't scale feature store to sub-ms at 10M+ customers
- ✗ Event log on relational DB is awkward

---

**See also:**
- ADR-001: Two-plane architecture
- ADR-003: DIR schema design
