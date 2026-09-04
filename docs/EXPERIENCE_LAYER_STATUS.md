# Experience Layer — Status

**Last verified:** 2026-09-04 by an automated suite, not by eye.

```
Integration          6 passed  - author -> compile -> execute -> replay
Determinism         30 passed  - packages/runtime, byte-identical replay
Conformance         69 passed  - ADR-003 corpus, TypeScript reference
Conformance (JVM)    2 passed  - engines/kotlin, same corpus, 58 cases compared
Compiler            40 passed  - packages/compiler
Performance          5 passed  - bench/harness, the p95 < 50ms gate
Unit (Vitest)       38 passed  - apps/console
E2E (Playwright)   104 passed  - 21 contract, 18 axe, 7 skipped by design
Typecheck           clean
Lint                0 errors   - root and console, which are separate configs
                   ---
                    294 tests, two languages
```

The console was linted by nobody until 2026-09-04: `apps/console/.eslintrc.json`
had no `"root": true`, so ESLint cascaded to the repo config, whose
`ignorePatterns` excludes `apps/console`. Every file was silently skipped, in CI
too. Fixing it surfaced eight real errors. The workflow now runs both configs.

Legend: **BUILT** = runs, and a test asserts it · **PARTIAL** = usable, with a
stated gap · **MISSING** = not started.

Nothing is marked BUILT unless a test would fail if it broke.

---

## Routes

| Route | Status | Notes |
|---|---|---|
| `/login` | BUILT | Three demo accounts with different roles. Session restore, guard, logout. |
| `/` | BUILT | Catalogue counts, decision volume, approval queue, agent activity. |
| `/propositions` | BUILT | Issue › Group tree with counts, sortable catalogue, search and status filter. |
| `/propositions/[id]` | BUILT | Financials, per-channel treatments, three-tier policy, resolved autonomy. |
| `/engagement-policies` | BUILT | Eligibility / applicability / suitability with conditions rendered. |
| `/contact-policy` | BUILT | Frequency caps, cooldowns, scope. |
| `/arbitration` | BUILT | P × V × L × C weight editor; publishing persists and is audited. |
| `/strategies` | BUILT | Artifact list with compile status per strategy. |
| `/strategies/[id]` | BUILT | Compiler verdict with remedies, DIR canvas (read-only), node inspector. |
| `/decisions` | BUILT | 5,000 engine-executed decisions in a virtualised grid, unified search with filter chips. |
| `/decisions/[id]` | BUILT | Real cascade from the engine, score composition, chain hash, replay that re-executes and compares hashes. |
| `/approvals` | BUILT | Change request queue, agent vs person provenance. |
| `/approvals/[id]` | BUILT | Diff, bias-gated simulation, approve/reject — applies the diff on approval. |
| `/agentic` | BUILT | L0–L4 ladder, per-scope guardrails, editable level, agent activity feed. |
| `/audit` | BUILT | Append-only log, filterable by actor type. Every write lands here. |
| `/settings` | BUILT | Account, roles, permissions, appearance, environment. |
| `/simulations` | PARTIAL | Shows simulations attached to change requests. Ad-hoc simulation is **not built**, and the page says so. |

---

## Foundations

| Concern | Status | Notes |
|---|---|---|
| Auth | BUILT | Role-filtered nav; actions gated in the UI *and* refused server-side (403). |
| Persistence | BUILT | In-memory store, process-lifetime. Writes are audited. `POST /api/_test/reset` restores the seed. |
| Design tokens | BUILT | RGB-channel custom properties. Dark mode is a token swap. |
| Density | BUILT | compact / comfortable drive row height, padding and type scale. |
| Data grid | BUILT | Windowed above 80 rows: 5,000 decisions render ~30 DOM rows. Sortable, keyboard-operable, responsive column hiding. |
| Search | BUILT | One box with facet suggestions and dismissible chips, replacing a labelled input per parameter. |
| Breadcrumbs | BUILT | On every detail route, above the title. |
| Typography | BUILT | Inter, self-hosted by next/font so nothing leaves the machine. |
| Loading / empty / error / permission-denied | BUILT | Shared primitives on every data surface. |
| Canvas | PARTIAL | Read-only. Node positions are authored, not laid out — a layout algorithm needs design review. |
| Dev API | BUILT | `app/api/[...path]/route.ts` over the store. |
| MSW | OPT-IN | `NEXT_PUBLIC_USE_MSW=true`. Service workers do not register in every embedded browser, so route handlers are the default. |
| Vitest | BUILT | 31 tests: autonomy resolution, money formatting, fixture referential integrity. |
| Playwright | BUILT | 52 tests: navigation, auth, decisions, RBAC, persistence, appearance. |
| axe-core | BUILT | 14 pages, light and dark. Zero violations at WCAG 2.2 AA. |
| Execution engine | BUILT | `packages/runtime/src/deterministic`. Byte-identical across 100 runs; replay compares chain hashes. |
| Compiler | BUILT | `packages/compiler/src/strategy`. Validates the graph, pins versions and models, computes the critical path, and refuses anything the runtime could not execute safely. |
| Engine-backed data | BUILT | The console's 60 decisions are real engine output, not fixtures. Replay re-executes. |
| Storybook | PARTIAL | 5 story files - Button, primitives, DataTable, SmartSearch, the canvas node. Theme and density are toolbar globals, so all four axes are one click apart. **No stories for AppShell, CommandPalette, Notifications, HealthSummary, CompileReport or Breadcrumbs**, which the definition of done requires. |
| API contract | BUILT | `packages/client` is generated from `docs/metis-api.openapi.yaml`; the console compiles against those types, so a spec change it has not absorbed is a compile error. `contract.spec.ts` asserts the other direction: every operation not marked `proposed` is served and returns what the spec declares. CI fails if the generated client is stale. |
| Global search | BUILT | Cmd/Ctrl+K over pages, propositions, strategies and all 5,000 decisions. |
| Notifications | BUILT | Pending approvals and guardrail stops, merged, breaches first. |
| i18n | MISSING | The definition of done names `/packages/i18n/messages.json`. There is no such file. `packages/i18n` is a 55-line stub with ~20 keys that nothing imports; every string is inline in JSX. |
| Bundle budget | MISSING | The definition of done says route bundle size is checked in CI. Nothing checks it. |
| Skip link | BUILT | First tab stop on every page. axe passes WCAG 2.4.1 on the strength of a `<main>` landmark alone, so an E2E test asserts the tab order instead. |
| Performance gate | BUILT | `bench/harness`, run by `npm test` and CI. p95 measured with `performance.now()` against seeded, reproducible workloads. |
| Canonical serialisation | BUILT | Specified normatively in ADR-003, with a 67-case corpus generated from the reference. Both the TypeScript and Kotlin implementations are tested against it, so the determinism claim is a property of a specification rather than of one file. |
| Second engine (JVM) | PARTIAL | `engines/kotlin` implements canonicalisation and hashing only, and agrees byte-for-byte. Policy evaluation, arbitration and the trace are still TypeScript. |

---

## Bugs the test suite caught

Worth recording, because each was invisible by eye:

1. **`tailwind-merge` silently dropped text colours.** It did not know `text-body`
   and `text-label` were font sizes, so it treated them as conflicting with
   `text-white` and removed the colour. Every filled button rendered dark text on
   a dark fill — 3.04:1 on the danger button. Fixed by registering the custom
   scale in `lib/cn.ts`.
2. **White text on the dark-mode accent measured 2.75:1.** The dark accent is a
   light blue used both as text and as a fill. Fixed with `--on-accent` /
   `--on-block` tokens that flip to near-black in dark mode.
3. **`--text-subtle` failed contrast** at 4.29:1 on white and 3.75:1 on sunken.
   The whole text ramp moved one step darker.
4. **`--hold` and `--l0` failed** at 4.03:1 and 4.07:1. Darkened.
5. **A `<dl>` contained `<p>` elements** on the settings page. Rewritten as a list.
6. **The session was dropped on any probe failure**, including a transient error
   while the dev server recompiled. Now only a 401 clears the token.
7. **Stale build output committed inside `packages/*/src/`** shadowed the
   TypeScript sources, so `@metis/core` resolved to a compiled file predating the
   domain model. Deleted and gitignored.
8. **A p95 latency below the graph's own critical path.** The test now computes
   the longest path through the DAG.
9. **The platform's central claim was false by construction.** The original
   executor stamped `crypto.randomUUID()` and `Date.now()` into the trace it
   then hashed, so two runs of the same decision could never match - replay
   could not have worked. It also hashed inputs with plain `JSON.stringify`,
   which is key-order dependent. Replaced by a deterministic engine that splits
   the trace into a reproducible half and a measured half, and hashes only the
   former.
10. **Contact policy ignored its own scope.** Every contact policy was applied
    to every candidate, so a max-one-per-month cooldown scoped to a single
    group suppressed the entire catalogue - all 60 decisions returned no offer.
11. **Arbitration dropped candidates with no model score.** A strategy may
    legitimately rank on value and lever alone (anonymous web traffic has no
    customer to score), and its formula says so. A missing term is neutral, not
    disqualifying; before the fix that whole strategy never returned anything.
    The compiler now catches this statically as ARBITRATION_MISSING_SCORE - it
    found the same defect independently on first run.
12. **Two test runners were fighting over the same files.** Jest and Vitest both
    matched `*.test.ts` under `packages/`, so Jest failed on every Vitest import
    and the only integration test had not run in a long time. Consolidated on
    Vitest; `npm test` now runs everything.
13. **A project reference to a directory that was never created.** The root
    tsconfig referenced `planes/authoring`, which has no tsconfig, breaking any
    tool that walks the reference graph.
14. **The engine re-hashed the entire catalogue on every decision.** O(catalogue)
    work in the hot path, and almost all of the 1.5ms per decision was hashing
    identical data. Memoised on snapshot identity: 0.17ms, 8.6x faster, with a
    regression test so it cannot come back.

---

## Honest limits

- **Persistence is in-memory.** A server restart restores the seed. Durable
  storage arrives with the execution plane.
- **The canvas is read-only.** No editing, no layout algorithm, no compile step.
- **The execution plane is real, but partial.** The deterministic engine,
  canonical hashing, replay and the strategy compiler are built and tested. The
  artifact registry and event store are still scaffolds, and there is no WASM
  hot path - the engine is plain TypeScript.
- **Compilation is not enforced on publish.** The console shows the verdict, but
  nothing yet blocks promoting a strategy that fails to compile. That belongs
  with the artifact registry.
- **Scoring models are seeded hashes, not models.** They have the property that
  matters here - same customer, proposition and pinned version gives the same
  number - but they predict nothing.
- **The old Phase 0 DIR compiler is still exported** as `compileDir`, for the
  historical fixtures. Nothing executes its output.
- **Agent activity is fixture data.** No agent is running; the feed shows what the
  autonomy model would record.
- **One browser.** Playwright runs Chromium only.
- **Virtualisation assumes uniform row height** within a table, measured from the
  first row. True for every current grid; a table with variable-height rows would
  need per-row measurement.
- **Search facets are fixed per surface.** They map to query parameters the
  endpoint understands rather than being derived from the data.
- **No visual regression testing.** axe covers accessibility, not appearance.
- **axe cannot see focus-indicator contrast.** The header band's ring failed
  SC 1.4.11 at 2.36:1 in light mode through a green suite; arithmetic caught it,
  not a test. Anything painted on a surface outside the neutral ramp needs the
  contrast checked by hand.
- **Throughput does not hold at large candidate sets on one core.** Measured
  single-threaded: 5,213 decisions/s at 10 candidates, 2,140/s at 40, and 249/s
  at 400. The latency promise holds everywhere with two orders of magnitude of
  room (p95 of 7.5ms at the worst size), but sustaining the plan's 1000 req/s
  with a 400-candidate catalogue needs four cores, or a strategy that narrows
  candidates before scoring. The stress scenario reports throughput without
  gating it, because "1000 req/s" is a horizontally scaled service claim and
  this harness runs on one core.
- **No WASM hot path.** The engine is plain TypeScript. The numbers above are
  what that costs; the plan's sub-50ms target does not currently need more.
- **Only the serialisation is ported.** `engines/kotlin` proves the hashing
  contract is portable; the engine's own semantics - policy evaluation, scope
  resolution, arbitration, the elimination cascade - are specified only by the
  TypeScript implementation. Extending the corpus from values to whole
  decisions (artifact + catalogue + request in, chain hash out) is what would
  make a full second engine a bounded piece of work rather than a rewrite.
- **Seventeen of nineteen packages have no tests.** Only `compiler` and `runtime`
  do. `packages-system` (package signing), `simulation`, `adaptive-models`,
  `compliance`, `panel-host` and `nodes-core` are single files carrying explicit
  `Phase N` stubs. Composability, regulatory packs and panel extensibility are
  the differentiation claims in the plan, and none of them execute.
- **No database.** `docker-compose.yml` declares postgres, eventstore, redis and
  clickhouse; `infrastructure/docker`, `k8s` and `migrations` are empty
  directories; nothing connects to any of them.
- **Three of five planned ADRs exist.** Missing: DIR schema design, event
  sourcing, performance budgets.
- **Storybook runs on react-vite, not `@storybook/nextjs`.** Storybook 7 could not
  boot at all here: `@storybook/nextjs` resolves `next/config`, which Next.js 16
  removed, and the v7 renderer calls `ReactDOM.unmountComponentAtNode`, removed
  in React 19. Upgraded to Storybook 8.6 and switched to the plain React builder,
  which these presentational stories do not need Next for. A story that ever needs
  `next/image` or the app router will need that revisited.
