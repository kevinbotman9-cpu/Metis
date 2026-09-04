# Console Implementation Gaps

**Purpose:** Track what the console needs that the platform has not yet built.

When the console team reaches a feature that requires a platform API that doesn't exist:
1. Add an entry to this file with the operation ID and brief rationale
2. Add a contract to the OpenAPI spec as a proposed operation
3. Generate a mock in MSW
4. Build the console feature against the mock
5. Mark this file with the week the gap was registered and the estimated impact

The gap file is the backlog handed to the platform team. Do not remove items; mark them as resolved when the platform ships.

---

## Blocking Console Progress (High Priority)

### OpenAPI Spec Generation

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `generateOpenAPISpec` | Blocks U0 entirely | MISSING | Week 1 | Build a generator that reads `planes/execution/src/**/*.ts` and emits OpenAPI 3.1. Extracts JSDoc + TypeScript types. |

**Action:** Generate spec from existing TypeScript code. Start with artifact registry endpoints (publish, getArtifact, listVersions, promoteVersion, rollbackVersion, getAuditLog).

---

## U0 Blocking Gaps (Truth & Contracts)

None yet, pending OpenAPI spec generation.

---

## U2 Blocking Gaps (Trace Explorer — Demo-Critical)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `searchDecisions` | Decision search (filter, virtualise 100k+ rows) | MISSING | Week 1 | Query by date range, action, outcome, rule fired, node, segment, channel. Must return paginated results with cursor. |
| `getDecisionTrace` | Trace explorer + five renderers | MISSING | Week 1 | Fetch a DecisionTrace by decision_id. Returns full trace with all node eliminations, scores, arbitration ranking, constraints applied. |
| `replayDecision` | Replay surface ("Prove it" demo) | MISSING | Week 1 | Re-execute a historical decision. Takes decision_id + artifact version. Returns DecisionResponse. Assert byte-identical to original. |
| `getTraceAuditLog` | Compliance audit view | MISSING | Week 1 | Fetch all changes to traces (immutable after write, but metadata changes). For tamper detection. |

**Impact:** Cannot build the single strongest demo surface (compliance officer replaying a decision) without these APIs.

---

## U3 Blocking Gaps (Author & Prove)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `compileStrategy` | Compile panel + cost manifest | BUILT | Week 1 | CLI exists (`npm run compile`). Need to expose as HTTP API + wire to OpenAPI spec. |
| `simulateStrategy` | Simulation workbench | MISSING | Week 2 | Given a compiled artifact + population sample, run all decisions through it. Return aggregated outcomes (distribution, funnel, bias metrics). |
| `getCounterfactual` | Counterfactual explorer | MISSING | Week 2 | Given a decision_id + outcome, find minimal input changes that flip the result. Return diff. |
| `createChangeRequest` | Change request workflow | MISSING | Week 2 | Propose a new strategy version. Returns request_id + approval state. |
| `getChangeRequest` | Change request detail view | MISSING | Week 2 | Fetch change request + attached diff + simulated impact + bias results + cost delta. |
| `approveChangeRequest` | Approval quorum | MISSING | Week 2 | Approve a change request (requires role check). Audit who approved, when. |
| `publishStrategy` | Publish endpoint | BUILT | Week 1 | Exists in artifact registry. Need to wire to OpenAPI spec. |

**Impact:** Canvas editing and approval workflow cannot progress without simulate + counterfactual.

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

## Resolved Gaps

| Operation | Resolved In | Notes |
|-----------|------------|-------|
| (None yet) | — | —  |

---

## Notes for Platform Team

1. **Prioritize OpenAPI spec generation** (Week 1). Everything blocks on this.
2. **Prioritize trace APIs** (Week 1–2). The demo (Compliance Officer replaying a decision) cannot happen without these.
3. **Simulation + counterfactual** (Week 2–3) unblocks the approval workflow and the architect personas.
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

**Last reviewed:** 2026-09-03

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
