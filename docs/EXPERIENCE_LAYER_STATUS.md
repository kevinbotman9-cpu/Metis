# METIS Console Implementation Status

**Last updated:** 2026-09-03  
**Authority:** This document is the source of truth. `PHASES_SUMMARY.md` §10 claims are audited and re-marked here.

---

## Status Legend

- **BUILT** — Feature exists, tested, runs, no mocks
- **SCAFFOLD** — File exists, structure defined, no working behaviour
- **DESIGN** — Documented, no code
- **MISSING** — Not started
- **BLOCKED** — Waiting for platform feature

---

## Global Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| Next.js App Router setup | SCAFFOLD | `apps/console/` exists, no routes |
| Storybook | MISSING | Not installed |
| Playwright + visual testing | MISSING | Not configured |
| axe-core a11y testing | MISSING | Not in test setup |
| TanStack Query setup | MISSING | Not installed |
| Zustand | MISSING | Not installed |
| Radix UI | MISSING | Not installed |
| React Flow | MISSING | Not installed |
| MSW (Mock Service Worker) | MISSING | Not installed |
| TypeScript paths configured | MISSING | tsconfig.json needs updates |

**Gate for U0:** All infrastructure installed, Storybook compiles, MSW server runs.

---

## Packages

| Package | Status | What's Here | What's Missing |
|---------|--------|-------------|-----------------|
| `packages/ui-kit` | MISSING | Not started | Radix-based primitives across all four theme axes |
| `packages/client` | MISSING | Not started | Generated from OpenAPI spec |
| `packages/panel-host` | DESIGN | Manifest spec exists in vision doc | Runtime, capability bridge, slot rendering |
| `packages/panel-sdk` | DESIGN | Spec only | Authored panel contract, examples |
| `packages/trace-ui` | MISSING | Not started | Five renderers (customer / business / analyst / engineer / regulator) |
| `packages/canvas` | MISSING | Not started | Graph editor + node renderer registry |
| `packages/themes` | MISSING | Not started | Token system + four bundled theme axes |
| `packages/i18n` | MISSING | Not started | Message catalogue + ICU formatting |

**Gate for U1:** All packages scaffold; ui-kit covers all four theme axes in Storybook.

---

## OpenAPI Specification

| Item | Status | Notes |
|------|--------|-------|
| OpenAPI spec generated from platform code | MISSING | Must be generated, not hand-written |
| Spec includes all artifact registry endpoints | MISSING | Blocked on spec generator |
| Spec includes all execution endpoints | MISSING | Blocked on spec generator |
| Spec includes all trace/replay endpoints | MISSING | Blocked on spec generator |
| MSW handlers generated from spec | MISSING | Blocked on spec generation |
| `packages/client` generated from spec | MISSING | Blocked on spec generation |

**Action:** Build spec generator that reads `planes/execution/src/**/*.ts` and outputs OpenAPI 3.1. Start with simple extraction from JSDoc + TypeScript types.

---

## Surfaces by Persona (U0–U6 Roadmap)

### Global Shell (U1)

| Surface | Status | Notes |
|---------|--------|-------|
| App shell: left rail, work area, inspector | MISSING | Core layout |
| Tenant switcher | MISSING | Dropdown + auth integration |
| Environment switcher (dev/uat/prod) | MISSING | Distinct chrome per env |
| ⌘K command palette | MISSING | Navigate, run actions, search |
| Global search | MISSING | Strategies, actions, decisions, customers |
| Approvals inbox | MISSING | Badge count, state |
| Notification centre | MISSING | Publishes, rollbacks, alerts |
| Keyboard shortcut reference | MISSING | Modal or drawer |
| Docs drawer | MISSING | Contextual docs link |
| Impersonation / view-as (admin) | MISSING | Banner-marked |

---

### Decision Architect (U3)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| Strategy list | MISSING | U3 | Versions, status, owner, effective dates, last simulated |
| Canvas editor | MISSING | U3 | Palette from installed nodes, schema-driven inspector, inline validation |
| Compile panel | MISSING | U3 | **Hero surface** — data deps, models, cost vs budget, hard fail if over |
| Version diff | MISSING | U3 | Side-by-side canvas diff + textual diff + semantic summary |
| Live overlays | MISSING | U3 | 24h volumes per node; click for customer sample |
| Arbitration formula editor | MISSING | U3 | Named, versioned; per-level matrix; sliders with preview |
| Simulation workbench | MISSING | U3 | Blocked on Phase 1 (adaptive models) |
| Test case manager | MISSING | U3 | Fixtures, expected outputs, CI status |
| Batch run console | MISSING | U3 | Schedules, throttling, run history |

---

### Marketer (U5)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| Taxonomy browser | MISSING | U5 | Issue → Group → Action → Treatment tree |
| Action editor | MISSING | U5 | Properties, catalogue, effective dating, approval state |
| Treatment library | MISSING | U5 | Assets, per-channel variants, preview, approval, expiry |
| Campaign builder | MISSING | U5 | Segment builder, schedule, volume constraints |
| Always-on monitor | MISSING | U5 | Send rate, governance thresholds |
| Contact policy editor | MISSING | U5 | Frequency caps, suppression rules (plain English + generated) |
| Results | MISSING | U5 | By action, treatment, channel; lift; funnel; linked to decisions |

---

### Data Scientist (U5)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| Model registry | MISSING | U5 | List, lineage, versions, champion/challenger, shadow |
| Model detail | MISSING | U5 | Performance, drift, feature importance, adaptive binning |
| Cold-start monitor | MISSING | U5 | Which actions still exploring |
| Feature catalogue | MISSING | U5 | Defs, TTL, freshness, lineage, parity check |
| Model import wizard | MISSING | U5 | ONNX/PMML upload, mapping, shadow, promote |
| Training set explorer | MISSING | U5 | Erasure propagation visible |

---

### Compliance Officer (U2 — First Vertical Slice)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| Decision search | MISSING | U2 | Virtualised 100k+ rows; filter by date, action, outcome, rule, node, segment, channel |
| Trace explorer | MISSING | U2 | **Critical** — elimination cascade, score composition, arbitration ranking, constraints, consent, timings; five audience renderers |
| Replay ("Prove it") | MISSING | U2 | **Critical** — re-execute + identity assertion + chain hash verification visible |
| Counterfactual explorer | MISSING | U2 | Minimal input change that flips outcome |
| Bias dashboard | MISSING | U2 | Protected-attribute parity by action/segment over time |
| Consent console | MISSING | U2 | Opt-outs, erasure requests, propagation status |
| Regulatory pack manager | MISSING | U2 | Installed packs, upgrade reports (which decisions change) |
| Evidence export | MISSING | U2 | Regulator-ready pack (PDF + JSON + hash verification) |
| Model risk documentation | MISSING | U2 | SR 11-7 shaped doc from registry |
| Configuration audit log | MISSING | U2 | Every control-plane change, four-eyes records |

**Priority:** Trace explorer + replay is the demo. Build these first.

---

### Operator (U5)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| Health | MISSING | U5 | Throughput, p50/p95/p99, error budget |
| Degradation events | MISSING | U5 | Ladder usage, why, what was served |
| Feature store health | MISSING | U5 | Cache hit rate, hot keys, freshness |
| Deployment console | MISSING | U5 | Blue/green, publish, rollback, propagation |
| Package console | MISSING | U5 | Install/upgrade/rollback with dependency graph + change report |
| Region map | MISSING | U5 | Tenant residency, replication lag |

---

### Executive (U5)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| Value dashboard | MISSING | U5 | Incremental outcome, adoption, decisions served |
| Cost transparency | MISSING | U5 | Per-decision breakdown (compute, models, egress, authoring); trended |
| Shadow mode scoreboard | MISSING | U5 | Agreement vs incumbent; lift; confidence |

---

### Governance (Cross-persona, U3–U4)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| Change request detail | MISSING | U3 | PR-like view: visual diff, textual diff, simulated impact, bias, cost delta, reasoning, comments, quorum |
| Branch and merge | MISSING | U4 | For decisioning config |
| Environment promotion pipeline | MISSING | U4 | Dev → UAT → prod with gates |

---

### Admin (U4)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| User management | MISSING | U4 | Users, roles, RBAC |
| Theme manager | MISSING | U4 | Live preview, contrast audit |
| Layout manifest editor | MISSING | U4 | Drag-and-drop screen regions |
| Tenant settings | MISSING | U4 | Latency budget, residency, retention |
| SSO, API keys, webhooks | MISSING | U4 | Integrations |
| Package registry browser | MISSING | U4 | Install, upgrade, rollback |

---

### Embedded Surfaces (U6)

| Surface | Status | Phase | Notes |
|---------|--------|-------|-------|
| CSR / agent-assist widget | MISSING | U6 | Next best action, embeddable |
| RTC SDK | MISSING | U6 | Placement rendering + debugger |
| Generative UI composition | MISSING | U6 | Compose dashboard from panels via natural language |

---

## Platform Dependencies (Blocking Console)

| Capability | Status | Blocks | Impact |
|-----------|--------|--------|--------|
| OpenAPI spec for artifact registry | MISSING | U0 | Cannot generate client or mocks |
| OpenAPI spec for execution API | MISSING | U0 | Cannot wire trace explorer |
| OpenAPI spec for approval workflow | MISSING | U0 | Cannot wire change requests |
| Trace query API | MISSING | U2 | Blocks decision search |
| Replay API | MISSING | U2 | Blocks replay surface (demo-critical) |
| Simulation API | MISSING | U3 | Blocks simulation workbench |
| Feature catalogue API | MISSING | U5 | Blocks data scientist surfaces |
| Audit log query | MISSING | U2 | Blocks compliance audit view |

**Action:** Generate OpenAPI spec from platform code (start this week). Register all gaps in `/docs/gaps.md`.

---

## Design Deliverables

| Item | Status | Notes |
|------|--------|-------|
| Token system (light/dark × compact/comfortable) | DESIGN | Defined in Experience Layer plan §5 |
| Design language (typography, layout, motion) | DESIGN | Defined in Experience Layer plan §5 |
| Colour palette + semantic reservations | DESIGN | Defined in Experience Layer plan §5 |
| Component specs (Radix + tokens) | DESIGN | To be added to Storybook |
| Wireframes per surface | DESIGN | By persona |
| Interactive prototype (Figma) | MISSING | Trace explorer first |

---

## Testing Strategy

| Gate | Target | Enforced By | Status |
|------|--------|------------|--------|
| WCAG 2.2 AA | Zero axe violations | axe-core in CI | MISSING |
| Theme integrity | No literal colour/space/radius | ESLint rule | MISSING |
| Contrast | AA across all four axes | Theme install audit | MISSING |
| Route performance | LCP < 2.0s, INP < 200ms | Lighthouse CI | MISSING |
| Bundle budget | Per-route limits | Webpack CI | MISSING |
| Large data | 100k rows @ 50fps | Playwright perf | MISSING |
| Visual regression | No unintended diffs | Playwright visual | MISSING |
| API honesty | Zero direct fetch; generated client | ESLint rule | MISSING |
| i18n coverage | Zero untranslated literals | ESLint i18n rule | MISSING |

---

## Build Timeline (If 30 Weeks Available)

| Phase | Duration | Starting | Gate |
|-------|----------|----------|------|
| **U0 — Truth & Contracts** | 1–2 weeks | Week 1 | OpenAPI spec, MSW, client generated |
| **U1 — Foundation** | 2–3 weeks | Week 3 | Storybook with all primitives, shell, auth, i18n |
| **U2 — Trace Explorer** | 3–4 weeks | Week 6 | Decision search, trace reader, replay, evidence export |
| **U3 — Author & Prove** | 5–6 weeks | Week 10 | Canvas, compile panel, simulation, change requests |
| **U4 — Composable** | 4–5 weeks | Week 16 | Panel host, layout editor, theme manager, package console |
| **U5 — Operate & Sell** | 4–5 weeks | Week 21 | Marketer, operator, executive surfaces |
| **U6 — Edges** | 3–4 weeks | Week 26 | Widget, generative UI, multiplayer, VPAT |

---

## 12-Week Demo-Critical Path (If Time is Constrained)

**Scenario:** 12 weeks available, not 30.

| Week | Deliverable |
|------|-------------|
| 1–2 | U0: OpenAPI spec, client, MSW, Storybook setup |
| 2–3 | U1: Foundation with one alternate theme (proves theming) |
| 4–6 | U2: Trace explorer + replay (the demo) |
| 7–8 | Read-only canvas + compile panel + live overlays (no editing) |
| 9–10 | Change request detail with real diff + simulated impact |
| 11–12 | Cost transparency + shadow mode scoreboard (single pages each) |

**Demo story:** Here is a decision from your production log. Here is why it chose that offer. Here is proof it reproduces. Here is what an agent wants to change and what impact it would have. Here is what it costs compared to your incumbent. The platform makes every step visible and auditable.

---

## What Gets Built When

This is the only sequence that works:

1. **U0 first.** Spec, contracts, mock infrastructure. Everything else depends on it.
2. **U1 immediately after.** Token system, primitives, shell. Unblocks all future work.
3. **U2 for the demo.** Compliance Officer surfaces (trace + replay) are the differentiator.
4. **U3, U4, U5 in parallel** — they are independent persona surfaces; can run in three tracks.
5. **U6 last** — polish, extensibility, VPAT prep.

---

## Known Risks

1. **Status document problem recurs if not policed.** Mock-mode banner + `/docs/gaps.md` are the safeguards. Do not remove either.
2. **Canvas scope creep.** Graph editors absorb unlimited effort. Hard boundary: React Flow + schema-driven inspector, no custom layout algorithms in v1.
3. **Console outruns platform.** It will. Register every gap, mock it, ship against it. Mocks are honest development.
4. **Accessibility retrofitted.** It must start at the primitives (U1) or it is ruinous. Axe-core gates U1 completion.
5. **Design language consistency.** If tokens leak into components as hex values, themes-as-packages is broken. Enforce the token layer religiously.

---

## Success Criteria for Each Phase

**U0:** OpenAPI spec auto-generated from platform code, client + MSW generated from spec, all infrastructure installed.

**U1:** Every primitive in Storybook across all four theme axes, zero axe violations, shell + auth + i18n working.

**U2:** Compliance officer can find a decision, understand why it was chosen, replay it, export evidence. No help needed.

**U3:** Decision architect can edit a strategy, see compile cost, simulate it, route it through approval, all in the UI.

**U4:** External developer ships a UI panel and a node renderer in under a day, given only the published docs.

**U5:** Each persona completes their primary weekly task without leaving the console.

**U6:** Accessibility audit passes; VPAT statement ready; embeddable widget works in three frameworks.

---

## Next Action

1. **Generate the OpenAPI spec** from existing platform code (start with artifact registry)
2. **Create `/docs/gaps.md`** template
3. **Install dependencies** for U0 (Next.js, Storybook, Playwright, MSW, etc.)
4. **Scaffold monorepo structure** for all packages above
5. **Flag the five design decisions** made in §8.5 of the Experience Layer plan

**Owner:** Product + Engineering  
**Due:** End of this week (week of Sept 9)
