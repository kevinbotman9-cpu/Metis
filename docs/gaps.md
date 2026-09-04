# Console Implementation Gaps

**Purpose:** Track what the console needs that the platform has not yet built.

When the console reaches a feature that requires a platform API that doesn't exist:

1. Add the operation to `docs/metis-api.openapi.yaml` marked `x-metis-status: proposed`
2. Add an entry to this file with the operation ID and rationale
3. Mock it in the development store; **do not stub inside a component**
4. Mark it resolved here when the platform ships it

Since 2026-09-04 the spec is enforced rather than aspirational:
`packages/client` is generated from it, the console compiles against those
types, and `apps/console/tests/e2e/contract.spec.ts` asserts that every
operation *not* marked `proposed` is actually served and returns what the spec
says it returns. So this file can no longer quietly disagree with the spec —
but it can still disagree with reality about things the spec does not cover,
which is what the notes below are for.

Run `node scripts/validate-spec.mjs` for the current count.

---

## Status at a glance

| | Operations |
|---|---|
| Built, served, and contract-tested | 26 |
| Declared and marked `proposed` | 8 |
| Wanted but not yet in the spec | see persona sections below |

---

## Build-system gaps

Not platform APIs, but the same kind of problem: a check that appears to run
and does not.

| Gap | Registered | Notes |
|---|---|---|
| **Project references do not build** | 2026-09-04 | `tsc --build` fails on pre-existing Phase 0 files: `packages/compiler/src/compile.ts` imports `@metis/types` and `@metis/core` across `rootDir` boundaries, and `packages/nodes-core` no longer exports `CORE_NODE_TYPES`. Until this is fixed the per-package tsconfigs cannot be used for typechecking. |
| **The root typecheck checks zero files** | 2026-09-04 | The root tsconfig has `"include": []` and only references, and `tsc --noEmit -p` does not build references. CI now also runs the console's typecheck, which resolves `@metis/core`, `@metis/runtime` and `@metis/compiler` through path aliases and is what actually covers them. `bench/*` is still outside every working typecheck — the missing `connectors` field on its catalogue was caught by a failing benchmark, not by the compiler. |

---

## Proposed operations in the spec

These are declared, generate client types, and are exempt from the contract
test by their `proposed` marker. Nothing serves them.

| Operation | Console impact | Registered | Notes |
|---|---|---|---|
| `publishArtifact` | Publishing a compiled strategy | Week 1 | Registry exists as an in-memory class in `planes/execution/src/registry.ts` with no HTTP layer and no tests. |
| `getArtifact` | Fetching an immutable compiled artifact | Week 1 | Distinct from `getArtifactSummary`, which is what the console reads today. |
| `listVersions` | Version history | Week 1 | |
| `promoteVersion` | Blue/green promotion | Week 1 | |
| `rollbackVersion` | One-click rollback | Week 1 | The demo claim "one click rolls back instantly" is not yet true. |
| `getRegistryAuditLog` | Publish and promotion history per strategy | Week 1 | Separate from `/audit`, which is the console's own append-only log and *is* built. |
| `simulateStrategy` | Ad-hoc simulation | Week 2 | `/simulations` says plainly that this is not built and shows only simulations attached to change requests. |
| `getCounterfactual` | "What would have changed the outcome" | Week 2 | No UI yet. |

---

## Resolved

| Operation | Resolved | Notes |
|---|---|---|
| `generateOpenAPISpec` | 2026-09-04 | Inverted. The spec is hand-authored and is the source of truth; `packages/client` is generated *from* it, and CI fails if the two disagree. Generating the spec from code would have made the implementation authoritative, which is backwards for a contract. |
| `searchDecisions` | 2026-09-04 | GET with query parameters, not POST — search state lives in the URL. 5,000 decisions, virtualised. |
| `getDecisionTrace` | 2026-09-04 | Real engine output. The `DecisionTrace` schema in the spec now matches what the engine emits. |
| `replayDecision` | 2026-09-04 | Re-executes and compares chain hashes. Contract-tested. |
| `createChangeRequest` / `getChangeRequest` | 2026-09-04 | |
| `approveChangeRequest` / `rejectChangeRequest` | 2026-09-04 | Approval applies the diff and writes to the audit log. Permission-gated server-side, not just in the UI. |
| `getTaxonomy`, `listPropositions`, `getProposition`, `listTreatments` | 2026-09-04 | Offer catalogue, Issue › Group › Proposition. |
| `listEngagementPolicies`, `listContactPolicies` | 2026-09-04 | |
| `getArbitrationConfig` / `updateArbitrationConfig` | 2026-09-04 | |
| `listAutonomySettings` / `updateAutonomySetting` | 2026-09-04 | |
| `listAgentActivity` | 2026-09-04 | Fixture data — no agent is running. The *shape* is real; the activity is not. |
| `listChangeRequests`, `listAuditEvents`, `listArtifacts`, `getArtifactSummary` | 2026-09-04 | These were **served but missing from the spec entirely** until the contract work. |
| `login` / `getSession` | 2026-09-04 | Development identity only. No real identity provider. |

**Caveat that applies to every row above.** "Resolved" means the console has a
working endpoint with an enforced contract. It is served by
`apps/console/app/api/[...path]/route.ts` over an in-memory store that resets
when the process restarts. The execution plane does not serve any of them.
When it does, the contract is already written and the tests already exist.

---

## U4 Blocking Gaps (Composable Experience)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getNodePackage` | Canvas node renderers | MISSING | Week 3 | Fetch a node package. Must include canvas renderer + inspector schema + trace renderer fragment. Without this, canvas can only draw core 16 nodes. |
| `getPanelManifest` | Panel host security model | MISSING | Week 3 | Fetch panel manifest. Declares slots, data contract (API scopes), permissions, viewport. Used to validate panel capabilities. |
| `getLayoutManifest` | Layout editor / workspaces | MISSING | Week 3 | Fetch a screen layout artifact. Declares regions, slots, panel occupants. Versioned like strategies. |
| `publishLayoutManifest` | Admin persona | MISSING | Week 3 | Save a layout. Triggers audit + optional approval. |

**Impact:** Panel extensibility cannot be demo'd without node renderers from packages.

---

## U5 Blocking Gaps (Operate & Sell — Persona Surfaces)

### Data Scientist Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `listModels` | Model registry | MISSING | Week 4 | List all models + versions + champion/challenger state + shadow scoring status. |
| `getModelDetail` | Model detail view | MISSING | Week 4 | Fetch performance over time, drift, predictor importance. For adaptive models, binning + learning curves. |
| `getFeatureCatalog` | Feature catalogue | MISSING | Week 4 | Definitions, TTL, freshness, lineage. Which strategies consume each. |
| `checkFeatureParity` | Online/offline parity check | MISSING | Week 4 | Given a feature, compare online (feature store) vs offline (batch compute). Return distribution diff. |

### Marketer Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getTaxonomy` | Taxonomy browser | MISSING | Week 4 | Issue → Group → Action → Treatment tree. Return inherited properties + overrides. |
| `getActionDetail` | Action editor | MISSING | Week 4 | Properties, catalogue membership, effective dating, approval state. |
| `getTreatmentLibrary` | Treatment library | MISSING | Week 4 | Assets, per-channel variants, channel preview, approval, expiry. |
| `listCampaigns` | Campaign builder + results | MISSING | Week 4 | Campaigns + segments + schedules. Query results by action/treatment/channel/segment. |
| `getContactPolicy` | Contact policy editor | MISSING | Week 4 | Frequency cap matrix. Outcome-conditioned suppression rules. |

### Operator Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getHealth` | Health dashboard | MISSING | Week 4 | Throughput, p50/p95/p99, error budget. Per tenant + route. |
| `getDegradationEvents` | Degradation events | MISSING | Week 4 | When the degradation ladder was used, why, what was served. |
| `getFeatureStoreHealth` | Feature store health | MISSING | Week 4 | Cache hit rate, hot keys, freshness distribution. |
| `getDeploymentState` | Deployment console | BUILT (registry) | Week 4 | Blue/green + blue/green promotion already exists. Wire to OpenAPI spec. |
| `getPackageDependencies` | Package console | MISSING | Week 4 | Dependency graph for installed packages. Pre-flight change reports for upgrades. |

### Executive Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getValueMetrics` | Value dashboard | MISSING | Week 4 | Incremental outcome per decision, adoption by team, decisions served. |
| `getCostBreakdown` | Cost transparency | MISSING | Week 4 | Per-decision cost breakdown across compute, models, data, authoring. Trended. |
| `getShadowModeAgreement` | Shadow mode scoreboard | MISSING | Week 4 | Agreement with incumbent, disagreement analysis, estimated lift. |

**Impact:** Marketer and Operator personas cannot complete primary workflows without these. Executive cannot build the cost transparency story (a key differentiator vs Pega).

---

## U6 Blocking Gaps (Edges)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getNextBestAction` | CSR widget | MISSING | Week 5 | Given customer context, return top N actions + plain-language reasons. Embeddable contract. |
| `getRTCPlacements` | RTC SDK | MISSING | Week 5 | Real-time container rendering + placement debugger. Requires separate SDK. |

**Impact:** Not in v1 scope. Deferred to Phase U6.

---

## Notes for Platform Team

1. **The artifact registry** is the highest-value gap. Compilation is not enforced on publish
   today — the console shows the compiler's verdict but nothing blocks promoting a strategy
   that fails to compile. That gate belongs in the registry.
2. **Simulation + counterfactual** (Week 2–3) unblocks ad-hoc simulation and the architect personas.
4. **Persona surfaces** (Week 4+) can run in parallel once U1–U3 are stable.
5. **Every gap entry should have an operationId in the spec** so the console can reference it by name, not by description.

---

## How to Use This File

**For Console Team:**
- When you hit a missing API, add an entry above
- Generate a mock, build against it, don't stub in components
- Mark the week you registered the gap

**For Platform Team:**
- This is your backlog in order of console criticality
- When you ship a gap, update this file and notify the console team

---

**Last reviewed:** 2026-09-04

---

## Registered 2026-09-04 — CDH domain model and agentic autonomy

Added to the OpenAPI spec as proposed operations. The execution plane has built none of them;
the console runs against the development fixture store.

| Operation | Needed for | Platform status |
|---|---|---|
| `getTaxonomy` | Issue › Group › Proposition tree | Not built |
| `listPropositions` / `getProposition` | Offer catalogue and detail | Not built |
| `createProposition` / `updateProposition` | Authoring offers | Not built — writes are echoed, not persisted |
| `listTreatments` | Per-channel content | Not built |
| `listEngagementPolicies` | Eligibility / applicability / suitability | Not built |
| `listContactPolicies` | Suppression and frequency caps | Not built |
| `getArbitrationConfig` / `updateArbitrationConfig` | P × V × L × C weights | Not built |
| `listAutonomySettings` / `updateAutonomySetting` | Agentic autonomy per scope | Not built |
| `listAgentActivity` | Agent activity feed | Not built |
| `login` / `getSession` | Authentication | Not built — no real identity provider yet |

### Still outstanding from earlier

- `simulateStrategy` — ad-hoc simulation. `/simulations` states plainly that this is not built
  and shows only simulations attached to change requests.
- `getCounterfactual` — minimal-input-change explanations. No UI yet.

### Notes for the platform team

- **Money is minor units.** `Money.amount` is an integer in pence to avoid float drift.
- **Autonomy resolution is most-specific-first**: proposition › group › issue › tenant. The
  reference implementation is `resolveAutonomy()` in `packages/core/src/domain.ts`.
- **`issueId` on `Proposition` is denormalised** from its group, for tree and breadcrumb
  rendering without a second lookup.
- **A proposition with no active treatment cannot be delivered.** The console flags this; the
  compiler should reject promoting a strategy whose candidate set includes one.
