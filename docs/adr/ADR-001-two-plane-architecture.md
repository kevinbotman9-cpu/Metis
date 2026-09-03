# ADR-001: Two-Plane Architecture

**Status:** Accepted  
**Date:** 2026-09-03  
**Deciders:** METIS Architecture Team

## Context

METIS is positioning itself as an AI-native decision hub that competes with (and improves upon) Pega's decisioning platform. The key differentiator is the ability to combine AI agents (for design-time intelligence) with deterministic compilation (for runtime predictability and auditability).

Without a clear separation between authoring and execution, the platform faces several risks:
1. **LLM cost per decision**: Calling models at request time makes cost unpredictable
2. **Non-determinism**: LLM outputs vary, breaking audit and compliance claims
3. **Latency**: Request-time inference kills the <50ms target
4. **Vendor lock-in**: Dependency on a single model provider for decisions

## Decision

We adopt a two-plane architecture:

### Authoring Plane (Design-Time, AI-Orchestrated)
- Agents propose changes to strategies, rules, journeys, treatments
- Changes produce a **Decision Artifact** (DIR - Decision Intermediate Representation)
- Artifact is diffed, simulated, tested, and approved (per autonomy tier)
- All work is amortized: seconds to minutes per design cycle

### Execution Plane (Request-Time, Compiled & Deterministic)
- Compiled decision artifacts are published to a registry
- Runtime executes with **zero LLM calls** in the hot path
- Latency: sub-50ms, deterministic
- Audit: every decision is traceable and replayable

**The contract:** Agents design. Compilers validate. Runtime executes. Everything explains itself.

## Consequences

### Positive
- **Determinism:** Same inputs + same artifact version = identical outputs (auditability moat)
- **Cost predictability:** Authoring inference is bounded and amortized over millions of decisions
- **Latency guarantee:** No request-time ML means <50ms is achievable and testable
- **Explainability:** Traces are emitted by the engine, not reconstructed post-hoc
- **Honesty:** "Our agents build your strategies; a deterministic engine runs them" survives due diligence better than "an LLM decides"

### Negative
- **Complexity:** Building both planes is more engineering work than a single-plane system
- **Design cycle:** Agents can't iterate live; changes require compile → publish → deploy
- **Delayed autonomy:** Tier 3 (full autonomous decisions) requires working simulation, which is Phase 1+

## Why Not Alternatives

### Alternative A: Single Plane (LLM-in-Loop at Runtime)
- ✗ Non-deterministic → fails audit
- ✗ Unpredictable cost → hard to justify at scale
- ✗ Latency variance → can't promise <50ms
- ✗ Vendor dependence → LLM outage breaks decisioning

### Alternative B: Batch-Only (No Real-Time)
- ✗ Loses the "always-on" decisioning story vs Pega
- ✗ Limits use cases to overnight campaigns, not real-time personalization

## Validation (Phase 0)

By end of Phase 0, we will prove:
- Determinism: Execute the same artifact 1000 times, prove bit-identical results
- Latency: Load harness shows p95 < 50ms under 1000 req/sec
- Auditability: Replay any decision from 30 days ago, prove identical trace

---

**See also:**
- ADR-002: Technology stack (TypeScript, WASM, PostgreSQL)
- ADR-003: DIR schema design
- METIS_Vision_and_Build_Plan.md: §1 (The Thesis)
