# METIS — Vision and Build Plan


> **Vocabulary note, 2026-09-05.** The terminology in this document was updated in place
> to the canonical taxonomy in §3 of the METIS platform specification. Where it previously
> said *proposition*, *treatment*, *issue*, *group*, *engagement policy*, *contact policy*,
> *boost*, *decision flow* and *change set*, it now says *offer*, *creative*,
> *objective*, *category*, *targeting policy*, *frequency policy*, *boost*, *decision flow*
> and *change set*. *Arbitration* and *propensity* are retained deliberately — §3.2 keeps
> both as industry-standard. The argument and the intent are unchanged; only the words are.
> See the Vocabulary section of `CLAUDE.md`, which is normative.

**Audience:** Claude Code (implementation agent) and the product owner
**Status:** Direction-setting document. Supersedes prior scope framing where they conflict.
**Version:** 1.0 — September 2026

---

## 0. How to use this document

Sections 1–4 are **binding architecture**. Do not deviate without an explicit decision recorded in `/docs/adr/`.

Section 5 is the **parity backlog**. Each row is an epic. Treat "Missing" rows as work items, not aspirations.

Sections 6–8 are the **differentiation backlog**. These are what get the platform onto shortlists it has no right to be on.

Section 9 is the **sequenced plan**. Build in phase order. Phase boundaries have gates; do not cross a gate with a red item.

Where this document says MUST, it is a constraint. Where it says SHOULD, it is a strong default that can be traded away with a written reason.

---

## 1. The thesis

METIS today is described as an AI-native decision hub where twenty-eight agents do the work. That framing wins demos and loses technical due diligence, for the reasons your own assessment document sets out: variable cost per decision, non-deterministic outputs that are hard to reconcile with audit, supplier concentration on a model provider, and latency variance that threatens the sub-50ms claim.

The fix is not to retreat from agents. It is to be precise about where they operate.

**METIS has two planes.**

| | **Authoring plane** | **Execution plane** |
|---|---|---|
| Who acts | Agents, LLM-orchestrated | Compiled deterministic engine |
| When | Design time, continuously | Request time, per interaction |
| Latency budget | Seconds to minutes | Sub-50ms, hard |
| Cost profile | Bounded, amortised over millions of decisions | Effectively zero marginal LLM cost |
| Output | A signed, versioned **Decision Artifact** | A decision plus its explanation |
| Determinism | Not required | Absolute — same inputs, same version, same output |
| Auditability | Change provenance: who/what proposed, who approved | Replay: any past decision reproducible byte-for-byte |

Agents design flows, write eligibility rules, build journeys, generate creatives, tune arbitration weights, propose experiments, detect drift and draft the fix. Every one of those actions produces a **proposed change to a Decision Artifact**, which is diffed, simulated, approved (per autonomy tier) and compiled. The runtime then executes compiled artifacts with no model call in the hot path.

**Why this is the right bet:**

1. It neutralises every objection in §4.2 of the assessment document without giving up the agentic story.
2. It makes the cost-per-decision argument winnable at volume, which the assessment correctly names as the core of the TCO pitch.
3. It makes explainability *cheaper* rather than more expensive, because a compiled artifact can emit its own reasoning trace deterministically.
4. Pega cannot answer it quickly. They are bolting agents onto a runtime that was never designed to be a compilation target. We are designing the compilation target first.
5. It is honest. "Our agents build your decisioning; a deterministic engine runs it" survives a hostile architect's questions in a way that "an LLM decides" does not.

**One-line positioning:** *Agents author. A deterministic engine executes. Everything explains itself.*

---

## 2. What we defend, and what we merely use

Three pillars. Everything in the roadmap should ladder to one of them.

**Pillar 1 — Deterministic, explainable, replayable decisioning.**
Not "we log things." Any decision from any point in the retention window can be re-executed against its exact artifact version and input snapshot, producing an identical result. This is the regulatory moat and it compounds with time.

**Pillar 2 — Composable to the core.**
Every meaningful concept — decision node type, channel, data source, model provider, industry pack, regulatory pack, UI panel — is a package with a manifest, installable at runtime, versioned independently. Enterprises do not buy platforms any more; they buy things they can extend without a vendor ticket.

**Pillar 3 — An experience layer the customer can make their own.**
Pega's most consistent public criticism is its interface. Do not merely be prettier. Be *reconfigurable*: token-driven theming, layout manifests, pluggable panels, per-persona workspaces, and agent-assisted UI composition. A buyer who can re-skin and re-arrange the product for their own operating model has a switching cost of their own — in our favour.

**Used, not defended:** setup speed. Genesis stays and stays excellent. It is a wedge that wins first meetings and shortens pilots. It is not the story on slide one, because Blueprint is coming for it.

---

## 3. Non-negotiable design principles

These are constraints on every PR.

1. **No LLM call in the decision hot path.** Ever. If a feature seems to need one, it belongs in the authoring plane or in an async enrichment path with a cached result.
2. **Everything commercially significant is grounded.** Prices, quantities, eligibility, terms come from a system of record with a recorded version. Never generated.
3. **Explanation is emitted, not reconstructed.** The engine produces the reasoning trace as a by-product of execution. If a decision cannot explain itself, it does not ship.
4. **Every artifact is versioned, immutable and signed.** Flows, rules, journeys, models, creatives, packs. Mutation happens by publishing a new version.
5. **Every write to the control plane is an event.** Event-sourced. The current state is a projection. This gives change history, replay and rollback for free.
6. **Multi-tenancy is enforced at the data layer**, not in application code. Row-level security or per-tenant schema. Never a `WHERE tenant_id =` that a developer can forget.
7. **Extension points are declared, not discovered.** A registry of extension points with typed contracts. No monkey-patching, no dynamic import of arbitrary code paths.
8. **Fail closed on compliance, fail open on convenience.** Missing consent blocks the decision. Missing a nice-to-have enrichment degrades gracefully.
9. **Every capability has an API before it has a UI.** The UI is a first-class consumer of the same public API a customer would use.
10. **Performance budgets are tested, not hoped for.** Every hot-path change runs against a load harness in CI with a p95 gate.

---

## 4. Target architecture

### 4.1 Plane separation

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

### 4.2 The Decision IR — build this first

The Decision Intermediate Representation is the single most important new asset. It is the contract between the two planes and the thing that makes everything else composable.

**Requirements:**

- A declarative, serialisable graph format (start with a strict JSON Schema; consider a small DSL later for human authoring).
- Node types are supplied by packages, not hardcoded. Core set ships in `@metis/nodes-core`.
- Statically analysable: the compiler must be able to determine, before publish, the full set of data fields referenced, models invoked, external calls made, and worst-case execution cost.
- Compiles to an executable form with a bounded step count. No unbounded loops. No arbitrary code execution.
- Every node carries a stable ID that appears in the reasoning trace, so an explanation can point at the exact node that filtered an action out.
- Round-trips losslessly to and from the visual canvas.

**Minimum node taxonomy for parity** (each a package-provided type):
`source` · `filter` · `set-property` · `join` · `aggregate` · `category-by` · `score-model` · `score-adaptive` · `prioritise` · `switch` · `sub-flow` · `champion-challenger` · `interaction-history` · `constraint` · `suppress` · `arbitrate` · `explain-annotate`

**Compiler responsibilities:**
- Type-check field references against the customer data model.
- Resolve package/node versions and pin them into the artifact.
- Emit a static manifest: data dependencies, model dependencies, estimated p95 cost.
- Reject anything exceeding the tenant's latency budget at compile time rather than at 3am in production.

### 4.3 Package system

Everything extensible is a package with a manifest.

```
metis-package.json
{
  "id": "metis.pack.telco.uk",
  "kind": "industry-pack",        // node | channel | model-provider |
                                   // industry-pack | regulatory-pack |
                                   // ui-panel | theme | connector | agent
  "version": "2.1.0",
  "apiVersion": "metis/v1",
  "provides": ["data-model", "actions", "journeys", "flows", "themes"],
  "requires": { "metis.core": ">=1.4", "metis.pack.reg.uk-gdpr": "^1.0" },
  "extensionPoints": { ... },
  "signature": "..."
}
```

Package kinds to support:

| Kind | What it contributes | Example |
|---|---|---|
| `industry-pack` | Data model, actions, journeys, flow templates, personas | TM Forum SID telco; BIAN banking |
| `regulatory-pack` | Consent rules, retention policy, mandatory checks, disclosure text | UK FCA Consumer Duty; EU AI Act; GDPR; CCPA |
| `node` | New DIR node types with typed contracts | Custom scoring node |
| `channel` | Delivery adapter + creative schema + render contract | WhatsApp, in-app, IVR, DOOH |
| `model-provider` | Scoring adapter | ONNX runtime, SageMaker, Vertex, in-house |
| `connector` | Data ingress/egress | Kafka, Snowflake, Salesforce, Adobe |
| `ui-panel` | Micro-frontend panel with slot declaration | Custom KPI board |
| `theme` | Token set, typography, density, motion | Bank house style |
| `agent` | Additional authoring-plane agent with tool contract | Bespoke pricing analyst agent |

**This is the single biggest "awe" boost with technical buyers.** An architect who can see a package manifest and understand how to extend the platform in a two-hour workshop is an architect who will champion you internally.

### 4.4 Data and feature layer

- **Customer data model** is pack-supplied and versioned; migrations are generated.
- **Online feature store** — Redis-backed, with declared feature definitions, TTLs, freshness stamps and lineage. Every feature read into a decision carries `{value, source_system, computed_at, version}`.
- **Offline store** — ClickHouse for history, training sets and analytics. Same feature definitions compile to both online and offline paths so training/serving skew is structurally prevented.
- **Interaction history** as a first-class, append-only store with fast per-customer recency queries (last N impressions, last outcome per action, contact counts per channel per window). Parity depends on this being fast; frequency policy evaluation is unusable without it.

### 4.5 Explainability spine

One trace format, five renderings. The engine emits a canonical `DecisionRecord`:

```
DecisionRecord {
  decision_id, tenant_id, customer_ref (pseudonymised),
  artifact_version, package_versions[], input_snapshot_hash,
  candidate_set: [ { action_id, entered_at_node, ... } ],
  eliminations: [ { action_id, node_id, rule_id, reason_code, human_reason } ],
  scores: [ { action_id, component: propensity|value|context|boost, value, model_version, top_features[] } ],
  arbitration: { formula_version, ranked[], winner },
  constraints_applied: [ ... ],
  consent_state, compliance_checks[],
  timings_by_node, total_ms,
  chain_hash, prev_hash
}
```

Renderers for customer / business user / analyst / engineer / regulator are pure functions over this structure. Adding an audience later means adding a renderer, not changing the engine.

**Replay service:** given `decision_id`, rehydrate the artifact version + input snapshot and re-execute. Assert identical output. Expose this as a product feature ("Prove it"), not just an internal test.

### 4.6 Model layer

- Adapter interface: `score(features) -> {score, confidence, feature_attributions}`. Providers are packages.
- Support import of ONNX and PMML at minimum. This matters more than it sounds — enterprises have models already and will not rebuild them.
- **Adaptive models are a build item, not a wrapper.** See §5.
- Model registry with lineage, version pinning, champion/challenger, shadow scoring, and drift monitors.

---

## 5. Functional parity map — Pega CDH → METIS

The assessment document's §4.3 is right: the gap is unglamorous accumulated capability, discovered by buyers one requirement at a time. The defence is to enumerate it now.

Status key: **H** = have (per current docs) · **P** = partial · **M** = missing.

### 5.1 Business structure and taxonomy

| Capability | Pega equivalent | Status | Build note |
|---|---|---|---|
| Hierarchical taxonomy (Objective → Category → Action → Creative) | NBA Designer taxonomy | P | Formalise. Actions exist; the hierarchy and its inheritance semantics need to be explicit and pack-supplied. |
| Action properties, catalogues, versioning | Offer Management | P | Add approval state machine and effective-dating. |
| Creatives per channel with variants | Creatives | P | Creative must be a distinct entity from Action, with per-channel schema from the channel package. |
| Content library with approval workflow | Content Manager | M | Asset store, versions, review/approve, expiry, usage tracking, brand checks. |
| Effective dating and scheduling on any artifact | Availability dates | M | Cross-cutting: `valid_from`/`valid_to` on actions, creatives, flows. |

### 5.2 Targeting policy

| Capability | Pega equivalent | Status | Build note |
|---|---|---|---|
| Eligibility (hard rules) | Eligibility | H | Keep deterministic, versioned, testable in isolation. |
| Relevance (contextual relevance) | Relevance | P | Distinguish from eligibility. Different reason codes in the trace. |
| Suitability (customer-interest test) | Suitability | M | Needed for Consumer Duty style regimes. Make it a first-class layer with its own audit line. |
| Frequency policy / suppression | Frequency Policy | P | Requires fast IH: "suppress action X for 30 days after 3 impressions with no response." Volume + recency + outcome-conditioned. |
| Channel-level and customer-level frequency caps | Contact limits | P | Per channel, per period, per objective, with priority-based override. |
| Global opt-out and consent enforcement | Consent | P | Must fail closed. Pack-supplied consent taxonomy. |

### 5.3 Arbitration

| Capability | Pega equivalent | Status | Build note |
|---|---|---|---|
| Multi-factor ranking formula | P × C × V × L | P | Make the formula an artifact: named, versioned, editable, simulatable. Do not hardcode. |
| Business boosts / weighting by objective | Boosts | P | Expose as a business-user control with an immediate simulated impact preview. |
| Multi-level arbitration hierarchies | Category-then-action arbitration | M | Arbitrate within category, then across categories, with per-level formulas. Explicitly called out as a gap. |
| Channel-specific arbitration | Channel overrides | M | Same candidate set, different formula per channel/placement. |
| Bundle and sequencing decisions | Bundles | M | Deciding a *set* of actions, not just the top one. Required for real placements with N slots. |
| Tie-breaking and diversity constraints | — | M | Deterministic tie-break; optional diversity constraint so a customer does not see the same offer everywhere. Also a differentiator. |

### 5.4 Models and MLOps

| Capability | Pega equivalent | Status | Build note |
|---|---|---|---|
| Adaptive (self-learning) models | Adaptive Decision Manager | M | **Highest-priority parity gap.** Online-learning per action/creative/channel, with automatic predictor binning, importance and cold-start handling. Without this, buyers see METIS as a rules engine with a chatbot. |
| Predictive model import and serving | Prediction Studio | P | ONNX/PMML import, versioned serving, shadow mode. |
| Model monitoring, drift, performance reports | Model reports | P | Drift detection on inputs and outputs, alerting, auto-quarantine of degraded models. |
| Champion/challenger on models and flows | Champion Challenger | M | Node type + traffic split + significance testing + auto-promote (subject to autonomy tier). |
| Feature attribution per decision | Predictor importance | P | Must reach the trace, not just a report. |
| Model risk documentation generation | — | M | Generate SR 11-7-shaped model documentation from the registry. This is a *differentiator disguised as compliance*. |

### 5.5 Simulation and testing

| Capability | Pega equivalent | Status | Build note |
|---|---|---|---|
| Distribution simulation | Distribution test | M | Run a candidate artifact over a sampled audience; show what would be offered to whom. |
| What-if comparison of two artifact versions | Scenario Planner | M | Diff two versions on the same population. Show winners/losers by segment. |
| Under-served customer analysis | Value Finder | M | Find customers with no eligible action or uniformly low propensity. Excellent demo material. |
| Ethical bias testing | Bias policy | M | Protected-attribute parity checks on outcomes, pre-publish gate, recorded result. |
| Audience simulation on real IH | — | M | Replay historical interactions through a candidate artifact for a counterfactual estimate. |
| Unit tests on flows and rules | Test cases | M | Deterministic fixtures. Runs in CI. Required for the "business user changes things" story to be safe. |

**Do not underestimate this block.** Simulation is what makes autonomy palatable. Tier 3 is unsellable without it, and Tier 2 approvals are guesswork without it.

### 5.6 Channels and delivery

| Capability | Pega equivalent | Status | Build note |
|---|---|---|---|
| Inbound real-time containers | Real-Time Container | P | Named placements, slot counts, per-placement policy, capture of impression + click + outcome. |
| Agent-assist / CSR surface | Customer Service integration | P | Needs an embeddable widget and a documented contract. |
| Outbound campaigns with segments and schedules | Outbound schedules | P | Segment builder, volume constraints, throttling, quiet hours, retry. |
| Always-on outbound | 1:1 Operations | M | Continuous evaluation of the base against flows, with volume/frequency governance. |
| Batch and offline decisioning | Batch runs | M | Explicitly named as a gap. Same DIR, different executor. Millions of customers, no latency constraint. |
| Paid media audience export | Paid Media Manager | M | Meta/Google/TTD audience sync with consent filtering and suppression. |
| Event-triggered decisioning | Event Flow Manager | P | Stream processing with windowed patterns ("3 failed logins in 10 min"). |

### 5.7 Governance and change management

| Capability | Pega equivalent | Status | Build note |
|---|---|---|---|
| Change set → review → approve → deploy | 1:1 Operations Manager | P | Formalise as a workflow over artifact versions, with agent-proposed changes as first-class requests. |
| Branching and merge of decisioning config | Revision management | M | Because artifacts are versioned and diffable, this is achievable and is a genuine step beyond Pega. |
| Environment promotion (dev → UAT → prod) | Deployment Manager | M | Blue/green artifact publish with instant rollback. |
| Role-based access at artifact granularity | RBAC | H | Extend to per-objective/per-category scoping. |
| Immutable audit of every change | Audit | P | Extend chained audit from decisions to configuration changes. |
| Four-eyes / segregation of duties | — | M | Configurable approval quorum per artifact type and per tier. |

### 5.8 Data and operations

| Capability | Status | Build note |
|---|---|---|
| Data flows / ETL orchestration | P | Declarative pipelines, replayable, with lineage. |
| Data set abstractions (stream, DB, file, warehouse) | P | Connector packages. |
| Customer profile cache with freshness | H | Keep; add per-field freshness in the trace. |
| Retention and right-to-erasure | P | Erasure must propagate to IH, traces and training sets. Design now; retrofitting is brutal. |
| Multi-region residency | M | Tenant-pinned data residency. Required for EU/UK/AU buyers. |

---

## 6. Where we go beyond — the awe list

Parity gets you evaluated. These get you chosen.

**6.1 Decision replay and counterfactual explanation.**
"Why did this customer get that offer, and what would have had to be different for them to get the other one?" The engine can answer both because it is deterministic. Minimal counterfactual — the smallest change in inputs that flips the outcome — is a genuinely novel regulatory answer and demos beautifully.

**6.2 Compile-time guarantees.**
Publish a flow and the platform tells you, before it goes live: worst-case latency, data dependencies, models invoked, cost per thousand decisions, which customers become newly eligible or ineligible, and whether any protected-attribute disparity appeared. No incumbent does this well.

**6.3 The regulatory pack system.**
Compliance as installable, versioned content. When the EU AI Act guidance updates, customers install `metis.pack.reg.eu-aiact@2.3.0` and get a change report showing exactly which of their decisions would now behave differently. This turns a cost centre into a subscription.

**6.4 Agent-proposed change with human-grade diffs.**
An agent notices drift, drafts a flow change, runs simulation, and submits it as a change set containing: the diff, the simulated impact, the bias check, the cost delta and its own reasoning. A human sees a pull request, not a black box. This is the honest, defensible version of "autonomous."

**6.5 Shadow mode / Decision Twin.**
Run METIS alongside an incumbent on live traffic, decide nothing, and report where the two disagree and which would have performed better. This is the answer to "nobody wants to be first" — it removes the risk from the first deal and directly enables Scenario C in your assessment. **Build this early; it is a sales instrument as much as a feature.**

**6.6 Natural-language authoring with compilation, not execution.**
"Stop offering the 15% discount to anyone who complained in the last 30 days" produces a *diff to an eligibility rule*, shown in plain English and in the rule language, simulated, then approved. Never an LLM interpreting that sentence at request time.

**6.7 Cost transparency as a product surface.**
A live per-decision cost breakdown — compute, model serving, data egress, authoring-plane inference amortised. Publishing this while competitors cannot is a strong signal, and it directly answers assessment §7 condition 5.

---

## 7. Experience layer vision

The brief was explicit: composable architecture and a fantastic, changeable UI. Treat the UI as a product surface with its own architecture, not as a skin.

**7.1 Token-driven theming.**
Every visual value is a semantic token (`color.surface.raised`, `space.gutter`, `radius.control`, `motion.enter`). Themes are packages. A tenant can ship their brand as a theme package with zero code. Support light/dark, density (compact/comfortable), and accessibility modes (high contrast, reduced motion, dyslexia-friendly type) as orthogonal axes.

**7.2 Layout manifests.**
Screens are declared, not coded: a manifest describes regions, slots and the panels that occupy them. Admins reorder, hide and resize. Different personas get different manifests. Saved as versioned artifacts like everything else.

**7.3 Pluggable panels (micro-frontends).**
A panel declares which slots it can occupy, what data contract it needs, and what permissions it requires. Customers and partners can write panels. This is what turns the UI from a screen into a platform.

**7.4 Persona workspaces.**
Ship opinionated defaults, because most users do not want to configure anything: *Marketer* (campaigns, actions, results), *Decision Architect* (flows, arbitration, simulation), *Data Scientist* (models, drift, features), *Compliance Officer* (audit, bias, consent, evidence export), *Operator* (health, throughput, incidents), *Executive* (value, adoption, cost).

**7.5 The canvas.**
One canvas metaphor for journeys and flows, with live data overlays — show real volumes flowing through each node from the last 24 hours. Debug by clicking a node and seeing which customers took that path. Direct manipulation, undo/redo, keyboard-first, multiplayer-aware.

**7.6 Explanation-first surfaces.**
Every number in the UI is clickable to its trace. No unexplained figures anywhere in the product. This is a small discipline with an enormous cumulative effect on trust.

**7.7 Generative UI, carefully scoped.**
An agent may propose a dashboard or panel arrangement from a natural-language request, rendered from the declared panel library. It composes existing panels; it does not generate arbitrary code into the runtime.

**Reference the `frontend-design` skill for visual execution.** The design direction should be quiet, dense and information-first — the opposite of the interface complexity Pega is criticised for. Complexity should be available, not ambient.

---

## 8. Trust architecture

This section exists to answer the specific objections a technical evaluator will raise.

| Objection | Answer |
|---|---|
| "LLM cost per decision is unpredictable." | No LLM in the decision path. Authoring-plane inference is bounded and amortised. Publish the number. |
| "Non-determinism breaks audit." | Compiled artifacts are deterministic. Replay proves it. Any variation is attributable to an artifact version change or an input change, both recorded. |
| "You depend on Azure OpenAI." | Provider abstraction in the authoring plane; at least two providers supported plus a local option. A provider outage degrades authoring, not decisioning. |
| "Hallucination risk." | Grounding contract, plus the structural point that generated content never becomes a commitment without passing a rules gate and, above a threshold, human approval. |
| "Latency at scale." | Compile-time cost analysis, per-tenant latency budgets, load-tested in CI, degradation path to a cached default. |
| "Bias." | Pre-publish bias gate, continuous outcome monitoring, recorded evidence. |
| "Bus factor of one." | Not a product answer, but the architecture helps: packages, typed contracts and generated docs lower the onboarding cost for new engineers. |

---

## 9. Roadmap

Each phase has a gate. Do not begin the next phase with a red gate item.

### Phase 0 — Foundations (weeks 0–8)

The plane separation and the artifact model. Nothing else matters until this exists.

- Define the Decision IR schema and the core node package.
- Build the compiler: type checking, version pinning, static cost analysis.
- Build the artifact registry: immutable, versioned, signed, blue/green publish, instant rollback.
- Refactor the runtime to execute compiled artifacts with no model call in the hot path.
- Implement the canonical `DecisionRecord` and the replay service.
- Convert the control plane to event sourcing.
- Load harness in CI with a p95 gate.

**Gate:** a decision made today can be replayed in a month and produce a byte-identical result and trace. Zero LLM calls measured in the hot path under load.

### Phase 1 — Parity core (weeks 8–24)

The capabilities without which an evaluation is lost in week two.

- Adaptive models (online learning, binning, importance, cold start).
- Multi-level arbitration, channel-specific formulas, bundles and slots.
- Frequency policy with outcome-conditioned suppression over fast interaction history.
- Suitability layer; effective dating across artifacts.
- Simulation suite: distribution test, version diff on a population, value finder, bias gate.
- Batch/offline executor sharing the DIR.
- Change set workflow with agent-proposed changes as pull-request-shaped objects.
- Creative/content library with approval workflow.

**Gate:** a full evaluation script for one segment can be run end to end without a "we don't have that yet."

### Phase 2 — Composability and experience (weeks 20–36, overlapping)

- Package system: manifests, resolution, signing, install/upgrade/rollback, capability registry.
- Repackage Genesis industry content as `industry-pack`s; extract regulatory content into `regulatory-pack`s with change reports.
- Channel packages; at least one third-party channel implemented purely as a package to prove the contract.
- Theming engine, layout manifests, panel plugin system, persona workspaces.
- Canvas with live data overlays.
- Model provider adapters including ONNX/PMML import.

**Gate:** an external developer, given only the docs, ships a working node package, channel package and UI panel in under a day.

### Phase 3 — Scale and proof (weeks 32–52)

- Generate a realistic dataset: 10M+ customers, 24 months of interaction history, realistic skew and seasonality.
- Load test to sustained production volumes; publish measured p50/p95/p99, throughput and cost per thousand decisions.
- Multi-region residency; horizontal scaling of the feature store and IH.
- Shadow mode / Decision Twin, productised.
- Cost transparency surface.
- Chaos and failure testing; degradation paths.

**Gate:** the performance claims in the business overview can be restated against a 10M-customer dataset, with the methodology published.

### Phase 4 — Assurance (runs in parallel from Phase 2)

Not engineering work, but engineering-dependent, and it must start earlier than feels comfortable.

- SOC 2 Type II control implementation and observation window.
- ISO 27001 groundwork; independent penetration test.
- Model risk documentation generator.
- DPA templates, sub-processor register, data residency documentation.
- Disaster recovery, RTO/RPO, tested restore, upgrade and backward-compatibility policy.
- Support model: on-call, incident process, status page, SLA definitions.

---

## 10. Scale and cost engineering

Specific work items, because this is where the current claims are weakest.

- Feature store partitioning and hot-key handling; measure cache hit rate at 10M+ profiles, not 150.
- Interaction history: design for per-customer recency queries at billions of rows. ClickHouse for analytics, but a purpose-built recency index for the hot path.
- Precompute what can be precomputed. Eligibility over stable attributes can be materialised; only volatile signals need request-time evaluation.
- Establish per-decision cost accounting from day one: compute, storage, model serving, egress, amortised authoring inference. Make it a dashboard.
- Define and enforce per-tenant latency budgets at compile time.
- Degradation ladder: full decision → cached decision → default action → static fallback. Never a timeout to the channel.

---

## 11. Definition of done

Every capability ships with:

1. Public API before UI.
2. OpenAPI spec generated, not hand-written.
3. Deterministic unit tests plus at least one simulation fixture.
4. Trace contribution — if it affects a decision, it appears in the trace.
5. Load-test coverage if it touches the hot path.
6. Documentation page generated from the typed contract.
7. Audit events for every state change.
8. Tenant isolation test.
9. Accessibility check if it has a UI (WCAG 2.2 AA).
10. A rollback path.

---

## 12. Non-goals

State these explicitly to protect focus.

- Not building a CRM, CDP, campaign execution engine or content management system. Integrate.
- Not building a proprietary language or low-code runtime. That is the incumbent's trap.
- Not chasing feature breadth across six verticals. Depth in one, per the assessment's §5.
- Not making the LLM the decision-maker. Ever.
- Not competing on setup speed as the primary message.

---

## 13. Decisions needed from you

Claude Code cannot resolve these; they are yours.

1. **Segment.** The assessment says pick one. Telco-UK is the obvious candidate given the existing dataset and demo. Confirm, because §9 sequencing changes materially with the answer.
2. **Scenario C posture.** Is "layer above an incumbent" an entry flow we build for deliberately? If yes, the Pega/Adobe read-through connectors and Shadow Mode move into Phase 1.
3. **Adaptive models: build or integrate?** Building is the honest parity answer and is significant work. Integrating an external online-learning service is faster but adds a dependency. My recommendation is build, because it sits in the hot path and the determinism story depends on owning it.
4. **Open core?** Publishing the DIR schema and package SDK openly would accelerate the composability moat and partner story considerably. It also gives away the design. Worth a real decision rather than a default.
5. **Pricing model.** Section 5 of the assessment recommends platform fee with volume bands plus transparent inference cost. The cost transparency surface in §6.7 assumes that model. Confirm before building it.

---

## Appendix — suggested repository structure

```
metis/
├── packages/
│   ├── core/              # DIR schema, compiler, artifact registry
│   ├── runtime/           # execution plane, deterministic engine
│   ├── nodes-core/        # core DIR node types
│   ├── trace/             # DecisionRecord, renderers, replay
│   ├── sdk/               # package authoring SDK + typed contracts
│   └── ui-kit/            # tokens, primitives, panel host
├── planes/
│   ├── authoring/         # agents, Genesis, canvas, simulation
│   └── execution/         # API, feature store, IH, scoring
├── packs/
│   ├── industry/          # telco-uk, banking-uk, insurance-uk …
│   └── regulatory/        # gdpr, eu-aiact, fca-consumer-duty …
├── apps/
│   ├── console/           # main product UI
│   └── embed/             # CSR widget, real-time container SDK
├── bench/                 # load harness, dataset generator
└── docs/
    ├── adr/               # architecture decision records
    └── packages/          # generated package docs
```

---

**The bet, restated.** Not "AI makes the decisions." Instead: AI does the work that used to require eleven to forty-five specialists, and hands the business a deterministic, replayable, explainable machine that it can extend, re-skin and defend to a regulator. That is a claim which survives due diligence, which the incumbent cannot retrofit quickly, and which gets stronger as regulation tightens.
