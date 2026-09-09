# METIS — Experience Layer Build Plan


> **Vocabulary note, 2026-09-05.** The terminology in this document was updated in place
> to the canonical taxonomy in §3 of the METIS platform specification. Where it previously
> said *proposition*, *treatment*, *issue*, *group*, *engagement policy*, *contact policy*,
> *boost*, *decision flow* and *change set*, it now says *offer*, *creative*,
> *objective*, *category*, *targeting policy*, *frequency policy*, *boost*, *decision flow*
> and *change set*. *Arbitration* and *propensity* are retained deliberately — §3.2 keeps
> both as industry-standard. The argument and the intent are unchanged; only the words are.
> See the Vocabulary section of `CLAUDE.md`, which is normative.

**Audience:** Claude Code (implementation agent) and the product owner
**Status:** Direction-setting. Extends `METIS_Vision_and_Build_Plan.md` §7. It was written against `PHASES_SUMMARY.md`, which claimed Phases 0-4 complete and was deleted on 2026-09-05; for what is actually built, `docs/CAPABILITIES.md` is the single answer and this document does not compete with it.
**Version:** 1.0 — September 2026

---

## 1. The verdict

You are right, and the reason matters more than the conclusion.

A headless decision engine is a real product category. Rules engines, feature-flag services and pricing engines sell API-first to platform teams who build their own experience on top. That is a coherent business. It is not the business the METIS vision document describes.

The vision document names six personas. Four of them — Marketer, Compliance Officer, Executive, Operator — cannot use a compiler CLI. It names Pega's interface as the incumbent's most consistent public weakness and makes "an experience layer the customer can make their own" one of three defended pillars. It then lists an awe list in §6 of which almost every item is a screen: compile-time guarantees, counterfactual explanation, pack change reports, agent-proposed diffs, shadow mode scoreboards, cost transparency. A JSON API delivers none of that as a felt experience.

Three sharper consequences:

**The safety story is a visual story.** Tier 2 and Tier 3 autonomy are only sellable because a human can inspect what the agent proposes. A change set containing a diff, a simulated impact, a bias check and a cost delta is a screen. Nobody approves fifty JSON diffs a week. Without the approval surface, autonomy tiers collapse back to Tier 1, and the agentic pitch dies with them.

**Determinism without a trace viewer is an assertion, not a proof.** "Prove it" — replay a decision and show byte-identical output — is the single strongest demo in the platform. In a terminal it is a hash comparison. On screen it is a compliance officer picking a decision from last March, watching it re-execute, and seeing which node eliminated which offer and why. That is the moment that wins the room.

**Procurement will disqualify you mechanically.** Enterprise and public-sector RFPs in the UK and EU routinely require a usability demonstration and an accessibility conformance statement (WCAG 2.2 AA, VPAT). Your own §11 definition of done already requires WCAG 2.2 AA. With no UI there is nothing to certify and some tenders are unbiddable.

**Where I'd push back on the framing.** The problem is not that METIS chose "no UI." It is that "every capability has an API before it has a UI" (§3.9) has been executed as "API instead of UI." The principle is correct and should be kept. Building the console early is the cheapest way to enforce it, because the console becomes the first hostile consumer of your own public API and finds its design flaws before a customer does. API-first and UI-early are complementary, not sequential.

**If you want the headless path anyway,** it is available, but it requires changing the ICP from "Pega CDH replacement for a telco marketing and compliance org" to "decisioning infrastructure for platform engineering teams." Different buyer, different pricing, different competitors, different sales motion. Decide that deliberately or not at all.

---

## 2. Before anything is built: the status document is ahead of the code

`PHASES_SUMMARY.md` marked the Phase 2 experience layer complete while the build transcript showed `apps/console/` and the canvas designer as "scaffolded." Those are not the same thing, and that gap is why the file was deleted and replaced by `docs/CAPABILITIES.md`, whose rule is that BUILT means a test fails when it breaks.

This matters specifically for an agentic build. If Claude Code is told the platform is complete, it will write a console against APIs that do not exist, invent plausible response shapes, hardcode sample data into components, and produce a beautiful demo that lies. That failure is very hard to detect from screenshots and very embarrassing to discover in a customer session.

**Task zero, before any UI work:**

1. Run an inventory across the repo and re-mark every line in `PHASES_SUMMARY.md` as one of: `BUILT` (has tests, runs), `SCAFFOLD` (file exists, no working behaviour), `DESIGN` (documented only), `MISSING`.
2. Generate an OpenAPI spec from the code that actually exists. Not hand-written — generated, per §11.2.
3. Anything the UI needs that is not `BUILT` becomes a contract in the spec plus a mock, and the console displays a persistent build-mode banner whenever it is reading from mocks.

This is not bureaucracy. It is the only thing standing between you and a demo that cannot survive one unscripted question.

---

## 3. Assumptions

Stated so you can correct them rather than discover them.

- Primary ICP is telco-UK, per §13.1 of the vision document.
- The console is deployed into customer infrastructure (Kubernetes), not only as multi-tenant SaaS, so it must run without a public CDN and support air-gapped installs.
- Buyers include large banks and telcos, so SSO, RBAC, WCAG 2.2 AA and a VPAT are mandatory, not nice-to-have.
- Third-party UI panels are a real requirement (§7.3), which means the panel host must treat panel code as untrusted.
- English first, but the string layer must be externalised from day one because EU deployments will demand it and retrofitting i18n is brutal.

---

## 4. UI architecture (binding)

These are constraints on every PR. Deviations need an ADR in `/docs/adr/`.

### 4.1 Repository shape

```
apps/
  console/          # main product UI (Next.js App Router)
  embed/            # CSR widget + real-time container SDK (web components)
  storybook/        # component workshop + visual regression target
packages/
  ui-kit/           # design tokens + primitives (no product concepts)
  panel-host/       # slot runtime, manifest loader, capability bridge
  panel-sdk/        # what third parties import to write a panel
  client/           # typed API client, GENERATED from OpenAPI
  trace-ui/         # DecisionRecord renderers (5 audiences), pure functions
  canvas/           # DIR graph editor, node renderer registry
  themes/           # token sets shipped as packages
  i18n/             # message catalogues + ICU formatting
```

### 4.2 Framework decisions and why

| Decision | Choice | Reason |
|---|---|---|
| App framework | Next.js App Router, `output: standalone` | Server components suit the dense read-heavy views (trace search, audit, registries); standalone output containerises cleanly for customer k8s. If you refuse a Node runtime in-cluster, fall back to Vite + React Router SPA and put the BFF in the existing execution plane. Record whichever you pick as ADR-010. |
| Server state | TanStack Query | Caching, background refresh, request dedup. No hand-rolled fetch hooks. |
| Client state | URL first, then Zustand for canvas-local only | Filters, selections and time ranges live in the URL so every view is shareable and linkable. This is a product feature, not a technical detail — compliance officers need to send a colleague a link to a specific trace. |
| Styling | CSS custom properties as the token layer, Tailwind mapped **onto those variables** | Non-negotiable: a theme package must be able to change appearance at runtime with no rebuild. If Tailwind emits literal hex values, themes-as-packages is dead. Configure Tailwind so every colour/space/radius utility resolves to `var(--...)`. |
| Primitives | Radix UI (unstyled, accessible) | Correct focus management and ARIA for free. Do not hand-write dialogs, menus or comboboxes. |
| Data grids | TanStack Table + virtualisation | Trace search and audit logs must handle 100k+ rows. Pagination alone is not acceptable for audit work. |
| Graph canvas | React Flow (xyflow) | MIT, mature pan/zoom/edges/minimap. Do not build a graph editor from scratch; spend the effort on node renderers and the compile/diff panels instead. |
| Charts | Recharts for standard, d3/visx for bespoke | Bespoke ones: candidate-set funnel (Sankey), version-diff population shift, adaptive model binning. |
| Collaboration | Yjs, scaffolded in Phase U4 | Presence indicators first; full CRDT editing later. |
| Testing | Vitest, Playwright (E2E + visual), axe-core, Storybook | See §10. |

### 4.3 Rules that prevent the classic failures

1. **No component fetches directly.** All data goes through `packages/client`, which is generated from the OpenAPI spec. If an endpoint is not in the spec, it does not exist.
2. **No hardcoded sample data in any component, ever.** Mock data lives only in MSW handlers derived from the spec, and only in `MOCK` mode. In `MOCK` mode the console shows a persistent banner. This rule is the single most important instruction in this document for an agentic build.
3. **Every number is a link.** §7.6 of the vision doc, enforced as a lint rule where possible and as a review checklist item where not. A figure with no path to its trace is a bug.
4. **Every value carries provenance.** The feature layer already returns `{value, source_system, computed_at, version}`. The UI renders a provenance affordance on hover for any value derived from a feature. Freshness beyond TTL renders as stale, visibly.
5. **Nothing is destructive without a preview.** Publish, rollback, package upgrade and pack install all show a change report before they act.
6. **Environment is always visible.** Production is chromatically distinct from dev and UAT. Accidental production publishes are a category of incident you can design out.
7. **Keyboard first.** Every primary action reachable without a mouse; ⌘K command palette from day one. Decision architects and operators live in this product all day.
8. **Panels are untrusted.** Third-party panel code never receives ambient credentials. See §6.

---

## 5. Design direction

Working the frontend-design process here rather than defaulting.

**Subject:** a decision platform whose entire claim is that it can prove what it did. Audience: analysts, architects, compliance officers, operators — people who read dense information for a living and are suspicious of software that looks like a pitch deck. Primary job: make a complicated causal chain legible fast.

**The one bold thing:** the trace. Everything else in the product should be quiet, dense and unremarkable so that when you open a decision and watch its reasoning unfold, that is the thing people remember. Spend the design budget there — on the elimination cascade, the score composition, the arbitration ranking — and nowhere else.

**Palette.** Cool neutral base rather than warm cream, because the product is instrumentation, not editorial. Base greys with a slight blue cast, one structural accent used only for interactive affordance, and a semantic set that is reserved strictly for decision states and never for decoration:

```
--base-900  #14171C   ink / dark surface
--base-100  #F5F6F8   light surface
--accent    #2563C7   interactive only
--state-pass    #1E7A4E   eligible / passed / approved
--state-block   #B23A3A   eliminated / blocked / failed
--state-hold    #A66B00   suppressed / pending / stale
```

Semantic colours are load-bearing. If green means "approved" in the change set inbox and also means "brand accent" in the header, the trace loses its readability. Reserve them.

**Adopted 2026-09-07.** The console took the teal from a reference direction on 2026-09-05 and then hit exactly the collision described above — that teal was both the brand and the "gain" state. It now runs the palette this section asks for: a slate frame, a cool light work area, `--accent 37 99 199` (the `#2563C7` named here), and `--info` moved to cyan so that "informational" and "interactive" are not both blue. The amber stayed out of the semantic set: the reference's `#E58A34` measures 2.62:1 as text and lives on the chrome instead. Every value is measured by `scripts/check-contrast.mjs` rather than asserted here.

Dark mode is a first-class axis, not an afterthought. Operators run this on wall displays.

**Type.** One family with a strong numeric set, because most of this product is numbers in tables. Something like Inter Tight or IBM Plex Sans for the interface, with tabular figures enabled globally for any numeric column, and a mono face used only where characters must be counted (IDs, hashes, rule expressions, DIR source). Not a mono face for small labels as a style choice — that is the template tell.

Base size 14px for data-dense views, 16px for reading views (docs, change set descriptions, regulator-facing exports). Line length under 80 characters in prose regions.

**Layout.** A persistent left rail for navigation, a wide work area, and a right inspector that is contextual rather than fixed. The inspector is where the product's density lives — select a node, a decision, a model, an action, and the inspector explains it. Avoid the card grid. Most screens here are a table plus an inspector, and that is correct for the subject matter.

**Motion.** Only to explain state change: a node highlighting as a trace replays, a row settling when a filter applies, the diff gutter marking what changed. No entrance animations. No hover lifts on cards.

**Copy.** Active voice, sentence case, and a vocabulary that stays constant across the whole product. "Publish" produces "Published." Errors say what happened and what to do. Empty states point at the next action. Do not write "Submit" anywhere in this product.

---

## 6. Extensibility model, in detail

This is the part most teams get wrong, and it is the part your architect buyers will interrogate.

### 6.1 Themes as packages

A theme package ships a token set only — no CSS, no components. Loading a theme swaps the values of CSS custom properties on `:root`. Because Tailwind resolves to those variables, the entire product re-skins without a rebuild.

Theme install must run an automatic contrast audit against WCAG 2.2 AA and refuse to publish a theme that fails, with a report showing which token pairs broke. A customer who re-skins the product into an inaccessible state has created your compliance problem, not theirs.

Orthogonal axes, per §7.1: light/dark × compact/comfortable × accessibility mode (high contrast, reduced motion, dyslexia-friendly). These multiply, so they must be independent token layers rather than eight hand-built themes.

### 6.2 Layout manifests

A screen is a JSON artifact declaring regions, slots and the panels occupying them, versioned in the same registry as flows. The layout editor is drag-and-drop over that manifest. Personas are just default manifests. Users can fork one, and an admin can publish a fork as the new default for a role.

### 6.3 Panels, and the security model

A panel declares, in its manifest: which slots it can occupy, its data contract (which API scopes it needs), its permissions, and its minimum viewport.

Two trust tiers:

- **First-party and signed partner panels** load as ESM modules into the host, get a scoped client from the capability bridge, and share the host's React tree and tokens.
- **Unsigned or customer-authored panels** render in a sandboxed iframe with `postMessage` to the same capability bridge, and inherit tokens through a CSS variable injection.

In both cases the panel never sees a bearer token. It asks the bridge, the bridge checks the panel manifest's declared scopes against the user's permissions, and the bridge makes the call. A panel that asks for data outside its declared contract gets refused and the refusal is logged. This is the answer to "can a customer really write a panel?" that an enterprise security team will accept.

### 6.4 Node renderers ship with node packages

When a package contributes a DIR node type, it also contributes: the canvas renderer, the inspector form (from a JSON Schema, not hand-built React), and the trace renderer fragment. Otherwise the canvas can only draw the core sixteen node types and the extensibility story stops at the engine boundary. This is the difference between "extensible platform" and "extensible backend with a fixed UI."

---

## 7. Complete surface inventory

Organised by persona, since the personas are how the product is sold and how the layout manifests are shipped. Cross-persona surfaces are listed once.

### 7.1 Global shell

- App shell: left rail, work area, contextual inspector, breadcrumb
- Tenant switcher; environment switcher with distinct chrome per environment
- ⌘K command palette: navigate, run actions, jump to artifact, jump to decision ID
- Global search across flows, actions, creatives, models, packages, decisions, customers
- Approvals inbox with badge count (this is the product's home for most users)
- Notification centre: publishes, rollbacks, drift alerts, failed batch runs, expiring creatives
- Keyboard shortcut reference; contextual docs drawer
- Impersonation / view-as-persona for admins, clearly banner-marked

### 7.2 Decision Architect

- **Flow list** — versions, status, owner, effective dates, environment published to, last simulated
- **Canvas editor** — palette populated from installed node packages; inspector driven by node JSON Schema; inline validation gutter; snap/align; undo/redo; keyboard node insertion
- **Compile panel** — the static manifest made visible: data dependencies, models invoked, external calls, worst-case latency vs tenant budget, estimated cost per thousand decisions, and a hard fail when the budget is exceeded (§4.2). This screen is one of your strongest differentiators; treat it as a hero surface, not a modal.
- **Version diff** — side-by-side canvas diff with added/removed/changed nodes highlighted, plus a textual DIR diff, plus a semantic summary ("3 more actions become eligible for customers under 25")
- **Live overlays** — 24h volumes flowing through each node; click a node to see the customer sample that took that path
- **Arbitration formula editor** — named, versioned formula; per-level and per-channel matrix; boost sliders with immediate simulated impact preview
- **Simulation workbench** — distribution test, version-vs-version on a population, value finder (under-served customers), bias gate, audience replay counterfactual; run history; shareable result permalinks
- **Test case manager** — deterministic fixtures, expected outputs, CI status per flow
- **Batch run console** — schedules, volume caps, throttling, quiet hours, retries, run history with per-run trace sampling

### 7.3 Marketer

- **Taxonomy browser** — Objective → Category → Action → Creative tree, showing inherited properties and where they were overridden
- **Action editor** — properties, catalogue membership, effective dating, approval state machine
- **Creative and content library** — assets, per-channel variants, channel-accurate preview (email, SMS with character count, push, web placement, IVR script), approval workflow, expiry, usage tracking, brand check results
- **Campaign builder** — segment builder with live count, schedule, volume constraints, quiet hours, retry policy
- **Always-on outbound monitor** — continuous evaluation state, governance thresholds, current send rate
- **Frequency policy editor** — frequency cap matrix (channel × period × objective), outcome-conditioned suppression rules authored in plain English with the generated rule shown alongside, and a simulated impact preview before save
- **Results** — by action, creative, channel, segment; lift; conversion funnel; every figure linked to its underlying decisions

### 7.4 Data Scientist

- **Model registry** — list, lineage graph, versions, champion/challenger state, shadow scoring status
- **Model detail** — performance over time, drift on inputs and outputs, predictor importance, and for adaptive models the binning visualisation and per-action learning curves
- **Cold-start monitor** — which actions/creatives are still in exploration
- **Feature catalogue** — definitions, TTL, freshness, lineage, online/offline parity check, which flows consume each feature
- **Model import wizard** — ONNX/PMML upload, schema mapping to the customer data model, validation, shadow deploy, promote
- **Training set explorer** — with erasure propagation status visible

### 7.5 Compliance Officer

This persona gets the most design attention, because this is where the product's claim is proved.

- **Decision search** — filter by date, action, outcome, rule fired, node hit, segment, channel; results virtualised over very large sets
- **Trace explorer** — the elimination cascade, score composition per component, arbitration ranking, constraints applied, consent state, per-node timings; audience toggle across the five renderers (customer / business / analyst / engineer / regulator)
- **Replay ("Prove it")** — re-execute the decision against its pinned artifact version and input snapshot; show the identity assertion and the chain hash verification, visibly
- **Counterfactual explorer** — minimal input change that flips the outcome, per §6.1
- **Bias dashboard** — protected-attribute parity by action and segment over time; history of pre-publish gate results
- **Consent console** — opt-out states, consent taxonomy from the installed regulatory pack, erasure requests and their propagation status across IH, traces and training sets
- **Regulatory pack manager** — installed packs and versions; upgrade change report showing exactly which flows and decisions change behaviour
- **Evidence export** — assemble a regulator-ready pack (PDF + machine-readable) with a hash verification page
- **Model risk documentation** — SR 11-7 shaped document generated from the registry, previewed and exported
- **Configuration audit log** — every control-plane change, who proposed, who approved, four-eyes records

### 7.6 Operator

- **Health** — throughput, p50/p95/p99 by tenant and route, error budget burn, current position on the degradation ladder
- **Degradation events** — when the ladder was used, why, and what was served
- **Feature store health** — cache hit rate, hot keys, freshness distribution
- **Deployment console** — blue/green state, publish, rollback, artifact propagation
- **Package console** — install/upgrade/rollback with a dependency graph view and a pre-flight change report
- **Region map** — tenant residency pinning, replication lag

### 7.7 Executive

- **Value** — incremental outcome per decision, adoption by team, decisions served
- **Cost transparency** — per-decision breakdown across compute, model serving, data egress and amortised authoring inference; by segment; trended (§6.7)
- **Shadow mode scoreboard** — agreement rate with the incumbent, disagreement analysis, estimated lift, confidence

### 7.8 Governance (cross-persona)

- **Change set detail** — the pull-request view: visual diff, textual diff, simulated impact, bias check, cost delta, the agent's stated reasoning, comments, required quorum, approve/reject/request changes
- **Branch and merge** for decisioning configuration
- **Environment promotion pipeline** — dev → UAT → prod with gate status per stage

### 7.9 Admin

- Users, roles, per-objective and per-category RBAC scoping
- Theme manager with live preview and contrast audit
- Layout manifest editor
- Tenant settings: latency budget, residency, retention policy
- SSO, API keys, webhooks
- Package registry browser

### 7.10 Embedded surfaces

- **CSR / agent-assist widget** — next best action with plain-language reasons, accept/decline capture, embeddable with a documented contract
- **Real-time container SDK** — placement rendering plus a placement debugger for integration engineers
- **Generative UI** — compose a dashboard from the installed panel library in response to a natural-language request; user approves; result saved as a layout manifest. Composition only, never code generation into the runtime.

---

## 8. Build sequence

UI phases are labelled U0–U6 to avoid collision with the platform phases. They run against the platform phases as follows: U0–U2 can start immediately against Phase 0 outputs; U3 needs Phase 1 simulation; U4 needs the package system.

### U0 — Truth and contracts (1–2 weeks)

- Repo inventory; re-mark `PHASES_SUMMARY.md` with BUILT / SCAFFOLD / DESIGN / MISSING
- Generate OpenAPI from existing code; write contracts for everything the console needs that does not yet exist
- Generate `packages/client` from the spec; generate MSW handlers from the same spec
- Monorepo scaffolding, CI, Storybook, Playwright, axe
- **Gate:** `packages/client` compiles, MSW serves every endpoint the spec declares, and the mock/live switch works with a visible banner.

### U1 — Foundation (2–3 weeks)

- Token system with all four axes; theme loading at runtime
- `ui-kit` primitives on Radix: button, input, select, combobox, dialog, drawer, tabs, toast, tooltip, table, tree, code block, diff viewer, empty state, error state, provenance chip
- App shell, navigation, tenant/environment switching, command palette, auth + RBAC-aware rendering
- i18n plumbing with all strings externalised
- **Gate:** Storybook covers every primitive in all four theme axes; axe reports zero violations; a stub theme package changes the entire shell with no rebuild.

### U2 — Trace explorer (3–4 weeks) — the first vertical slice

Deliberately first. It is read-only so the blast radius is small, it is the strongest differentiator, it forces the DecisionRecord API to become real, and it is demoable on its own.

- Decision search with virtualised results
- Trace explorer with all five audience renderers
- Replay with visible identity assertion and hash verification
- Provenance chips on every value
- Evidence export v1 (PDF + JSON with verification page)
- **Gate:** a compliance officer can find a decision from a date range, understand why the offer was chosen, replay it, and export defensible evidence, without help.

### U3 — Author and prove (5–6 weeks)

- Canvas editor with core node renderers and schema-driven inspector
- Compile panel with the full static manifest and budget enforcement
- Version diff, visual and textual and semantic
- Simulation workbench: distribution, version diff on population, value finder, bias gate
- Change set inbox and detail view; approval with quorum
- **Gate:** a decision architect edits a flow, sees its compile-time cost, simulates it against a population, gets a bias result, and routes it through approval to publish, entirely in the UI.

### U4 — Composable experience (4–5 weeks)

- Panel host, capability bridge, both trust tiers, `panel-sdk` with docs
- Layout manifest editor; persona workspaces shipped as default manifests
- Theme manager with contrast audit
- Package console with dependency graph and pre-flight change reports
- Node renderers loaded from node packages
- **Gate:** an external developer, given only the published docs, ships a working UI panel and a node package with a canvas renderer in under a day. This is the vision document's own Phase 2 gate; hold it honestly.

### U5 — Operate and sell (4–5 weeks)

- Marketer surfaces: taxonomy, action editor, content library, frequency policy, campaigns, results
- Data scientist surfaces: registry, drift, features, import wizard
- Operator surfaces: health, degradation, deployment, regions
- Executive surfaces: value, cost transparency, shadow mode scoreboard
- **Gate:** each persona can complete their primary weekly task without leaving the console.

### U6 — Edges (3–4 weeks)

- Embeddable CSR widget and RTC SDK with placement debugger
- Generative UI composition
- Multiplayer presence on the canvas
- Accessibility audit and VPAT preparation
- Performance hardening against the budgets in §10

---

## 9. Claude Code operating manual

### 9.1 `CLAUDE.md` for the repo

Put this at the repo root. It is what keeps a long agentic build from drifting.

```markdown
# METIS Console — agent instructions

## Absolute rules
1. Never hardcode sample data in a component. Mock data lives only in MSW
   handlers generated from the OpenAPI spec.
2. Never call fetch directly from a component. Use packages/client.
3. Never add an endpoint to packages/client by hand. Add it to the OpenAPI
   spec and regenerate.
4. Never write a literal colour, spacing or radius value. Use tokens.
5. Never build a dialog, menu, combobox or tooltip by hand. Use Radix.
6. If a capability is not in the spec and not BUILT in the platform,
   stop and ask. Do not invent the API.

## Definition of done for every PR
- Storybook story for every new component, all four theme axes
- Vitest unit tests for logic; Playwright test for any new user flow
- axe-core clean; keyboard path verified; visible focus
- Loading, empty, error and permission-denied states implemented
- Strings in the i18n catalogue, not inline
- Every displayed number links to its source trace or explains why it cannot
- Bundle budget for the route not exceeded
- Screenshot attached to the PR description

## Vocabulary
Use the product vocabulary consistently: artifact, flow, action,
creative, trace, replay, change set, package, pack, boost, placement.
Never "submit". Buttons name their effect.
```

### 9.2 Task template

Give Claude Code one task at a time in this shape. Vague tasks produce plausible-looking output that fails review.

```
TASK: <one screen or one component>
CONTEXT: <which persona, which phase, which section of this plan>
API: <exact operationIds from the OpenAPI spec it may use>
STATES: loading / empty / error / permission-denied / stale-data
INTERACTIONS: <keyboard paths, what is clickable to a trace>
ACCEPTANCE:
  - <behavioural assertions, written as Playwright test names>
OUT OF SCOPE: <explicitly, to stop scope drift>
```

### 9.3 Working order within a task

1. Read the relevant OpenAPI operations and the existing tokens.
2. Build in Storybook first, against MSW fixtures, before wiring into a route.
3. Screenshot and self-critique against §5 before opening the PR.
4. Wire into the route, add the Playwright test, run axe.

Building in Storybook first matters more than it sounds: it forces states to be enumerated and it makes agent output reviewable by a human in seconds rather than by running the whole app.

### 9.4 What to do when the platform is not ready

Add the contract to the spec, generate the mock, build against it, and register the gap in `/docs/gaps.md` with the operationIds required. The gap file is the backlog handed to the platform side. Do not stub inside the component.

---

## 10. Quality gates

| Gate | Threshold | Enforced by |
|---|---|---|
| Accessibility | WCAG 2.2 AA, zero axe violations, full keyboard path | axe-core in CI, manual audit per phase |
| Theme integrity | No literal colour/space/radius values in app code | Stylelint rule + custom ESLint rule |
| Contrast | Every shipped theme passes AA across all four axes | Theme install audit, run in CI for bundled themes |
| Route performance | LCP < 2.0s, INP < 200ms on the reference machine | Lighthouse CI |
| Bundle | Per-route budget; console shell < 250KB gzipped | CI budget check |
| Large data | Trace search renders 100k rows without dropping below 50fps on scroll | Playwright perf test |
| Visual regression | No unintended diffs | Playwright screenshots per Storybook story |
| API honesty | Zero direct fetch calls; zero hand-edited client code | ESLint rule + generated-file checksum |
| i18n | Zero untranslated literals in JSX | ESLint i18n rule |

---

## 11. If you have twelve weeks instead of thirty

The demo-critical subset, in order. Everything else waits.

1. U0 contracts and truth audit — non-negotiable, everything else is built on it
2. U1 foundation, with one theme and one alternate to prove theming works
3. U2 trace explorer and replay in full — this is the demo
4. Canvas in read-only mode with the compile panel and live overlays, editing deferred
5. Change set detail view with a real diff and simulated impact
6. Cost transparency and shadow mode scoreboard, single page each

That is a coherent story: here is a decision, here is why, here is proof it reproduces, here is what the agent wants to change and what it would do, here is what it costs, here is how it compares to your incumbent. It sells without a single editing surface.

---

## 12. Decisions I need from you

1. **Next.js with a Node runtime in-cluster, or a static SPA with the BFF folded into the execution plane?** This changes the deployment story with security teams and I would rather you choose than default.
2. **Do customer-authored panels need to run in production, or is signed-partner-only enough for v1?** The iframe sandbox tier roughly doubles the panel host work. It is the honest answer to §7.3 but it is not free.
3. **Which persona is the design north star?** I have assumed Compliance Officer, because the trace is the differentiator and compliance is the hardest audience to fake. If you think the buyer is really the Marketer, U2 and U5 swap order.
4. **Is the CSR widget in scope for v1?** It is a separate distribution problem — versioning, embedding, framework-agnostic delivery into someone else's app — and it often gets underestimated.
5. **Design language: bespoke or borrowed?** I have proposed a bespoke direction in §5. If you would rather ship faster on a known system, say so now rather than at U3, because the token layer is the thing everything else is built on.

---

## 13. Risks

- **The status document problem recurs.** If the UI ships marked complete while sitting on mocks, you have moved the credibility gap rather than closed it. The mock-mode banner and `/docs/gaps.md` exist specifically to stop this. Do not remove either.
- **Canvas scope creep.** Graph editors absorb unlimited effort. React Flow plus schema-driven inspectors plus a hard boundary at "we do not build custom layout algorithms in v1."
- **Panel security reviewed too late.** Get the capability bridge design in front of a security reviewer during U1, not U4. If the model is wrong, it invalidates the extensibility pitch.
- **Accessibility retrofitted.** WCAG 2.2 AA is cheap if it starts at the primitives and ruinous if it starts at the audit. This is why U1 gates on axe.
- **The console outruns the platform.** Likely, and mostly fine, as long as the gap register is honest and the demo script never crosses into mocked territory without saying so.

---

**One line for the top of the deck:** agents author it, a deterministic engine runs it, and the console is where a human can see, question, simulate and prove every part of it.
