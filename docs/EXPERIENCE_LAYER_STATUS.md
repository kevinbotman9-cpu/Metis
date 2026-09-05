# Experience Layer — Status

**Last verified:** 2026-09-05 by an automated suite, not by eye.

```
Integration          6 passed  - author -> compile -> execute -> replay
Runtime            140 passed  - packages/runtime: determinism, byte-identical
                                 replay, integration resolution, ADR-003
                                 value corpus and the 22-decision corpus
Compiler            40 passed  - packages/compiler
Registry            50 passed  - packages/registry; one behaviour suite run
                                 against memory and a real PostgreSQL
Performance          6 passed  - bench/harness, the p95 < 50ms gate
Unit (Vitest)       39 passed  - apps/console
E2E (Playwright)   133 passed  - 27 contract + cross-engine, 19 axe, 16 registry
                                 (11 skipped: write operations covered by
                                 permissions-and-writes and registry instead)
Conformance (JVM)   13 passed  - engines/kotlin :engine and :service; 67 values,
                                 22 decisions, 60 real decisions over HTTP
Typecheck           clean      - root config and the console's, separately
Lint                0 errors   - root and console, which are separate configs
                   ---
                    427 tests, two languages, two engines
```

The E2E gate was checked by breaking it: a deliberate failing assertion in
`app-shell.spec.ts` made Playwright exit 1, which is the only evidence that
CI's E2E step is doing anything.

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
| `/integrations` | BUILT | Configured connectors, what each supplies, declared latency against the budget, and activate/deactivate gated on `edit:integrations`. |
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
| i18n | MISSING | The definition of done names `/packages/i18n/messages.json`. That file never existed. `packages/i18n` was a 55-line stub with ~20 keys that nothing imported, and it was deleted on 2026-09-05; every string is inline in JSX. The rule in CLAUDE.md now describes nothing, which is the honest state rather than a worse one. |
| Bundle budget | MISSING | The definition of done says route bundle size is checked in CI. Nothing checks it. |
| Skip link | BUILT | First tab stop on every page. axe passes WCAG 2.4.1 on the strength of a `<main>` landmark alone, so an E2E test asserts the tab order instead. |
| Performance gate | BUILT | `bench/harness`, run by `npm test` and CI. p95 measured with `performance.now()` against seeded, reproducible workloads. |
| Canonical serialisation | BUILT | Specified normatively in ADR-003, with a 67-case corpus generated from the reference. Both the TypeScript and Kotlin implementations are tested against it, so the determinism claim is a property of a specification rather than of one file. |
| Integrations | BUILT | Connectors are configured once and used at decision time. Resolution runs before the deterministic core and its output is hashed into the input snapshot, so replay re-executes against what was fetched then and never calls a connector again. The compiler adds declared connector latency to the critical path. |
| Second engine (JVM) | BUILT | `engines/kotlin :engine` implements canonicalisation, hashing and the decision engine, and agrees with the reference on all 58 value cases and all 22 decisions. |
| JVM decision service | BUILT | `engines/kotlin :service` serves `executeDecision`, trace and replay over HTTP, and reproduces 60 of the console's real decisions byte for byte. In-memory state, no auth, no integration gateway - see its README. |
| Artifact registry | BUILT | `packages/registry`. Publishing compiles first and refuses anything with errors; publishing does not activate; versions are immutable, bound to an artifact hash; promotion and rollback are separate, audited actions. |
| Durable storage | BUILT | PostgreSQL, selected by `METIS_DATABASE_URL`. The same behaviour suite runs against memory and a real database, so the rules are known to be storage-independent. Immutability is enforced twice: the application refuses to overwrite a published version, and triggers on `registry_versions` and `registry_events` reject `UPDATE` and `DELETE` outright. A configured database that cannot be reached is an error, never a silent fallback to storage that forgets. |
| Compilation on publish | BUILT | The gap that stood open longest. A strategy that does not compile never enters the registry, so it cannot be promoted and cannot reach execution — and the refusal is recorded, because an audit that only shows successes cannot answer whether anyone tried. |
| `executeDecision` | BUILT | One OpenAPI operation, two implementations: the console's development store and the JVM service. Both are held to the same 60 expected chain hashes. |

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

- **Only the registry is durable.** Propositions, policies, arbitration weights,
  autonomy settings, change requests and the console's audit log are still an
  in-memory store that resets with the process. The registry proved the pattern;
  the rest of the control plane has not been moved onto it.
- **One migration, no runner.** `001_registry.sql` is idempotent and applied at
  startup. A second migration needs a real runner, and that is the moment to add
  one.
- **Nothing signs an artifact.** `CompiledStrategy` carries an `artifactHash`, so
  the registry can prove content is unchanged — not who vouched for it.
- **There is no authoring surface.** Versions are published through the API, and
  the console can promote and roll back but cannot draft a new version. The
  registry is ahead of the editor.
- **The canvas is read-only.** No editing, no layout algorithm, no compile step.
- **The execution plane is real, but partial.** The deterministic engine,
  canonical hashing, replay, the strategy compiler and the artifact registry are
  built and tested. There is no decision ledger, no idempotency, no outcome
  capture and no WASM hot path — the engine is plain TypeScript.
- **Scoring models are seeded hashes, not models.** They have the property that
  matters here - same customer, proposition and pinned version gives the same
  number - but they predict nothing.
- **The old Phase 0 DIR compiler is gone.** `compileDir`, `typeCheck`,
  `resolveVersions`, `analyzeCost`, the `metis-compile` CLI, `dir.schema.json`
  and the four committed compiled artifacts were deleted on 2026-09-05. Nothing
  executed their output, and keeping a second compiler alive "for the fixtures"
  meant keeping a second definition of what a strategy is.
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
- **The 5,000-decision corpus records resolution rather than performing it.**
  It is built synchronously at import and resolution is asynchronous, so the
  connector-supplied fields are written into the input the way a real system
  writes an input snapshot. The resolver itself is covered by 19 tests, and the
  live decision path really does call it. Latency shown on those fixture traces
  is the connector's declared p95, not a measurement, and is labelled as such.
- **`bench/*` is outside every working typecheck.** Its missing `connectors`
  field was caught by a failing benchmark rather than by the compiler. See the
  build-system gaps in docs/gaps.md.
- **The decision corpus is 22 cases, not a proof.** It covers the rules a
  reimplementation is most likely to get wrong - tie-breaks, scope resolution,
  the neutral-score rule, contact-policy scoping, the service exemption - and it
  bites: injecting a wrong neutral score fails 13 of 22 with field-level diffs.
  It does not cover every path, and it does not currently distinguish
  `StrictMath.pow` from `Math.pow`, which ADR-003 §4a is explicit about.
- **Two engines is now a maintenance obligation.** A change to arbitration or
  the trace shape has to land in both, or CI goes red in the Kotlin job. That is
  the intended cost: it is what stops the semantics drifting back into being
  whatever one directory of TypeScript happens to do.
- **Composability, regulatory packs and panel extensibility do not exist.**
  They previously appeared as `packages-system`, `compliance`, `panel-host`,
  `panel-sdk`, `simulation`, `adaptive-models`, `themes`, `ui-kit`, `canvas`,
  `i18n`, `trace`, `trace-ui`, `types` and `sdk` — fourteen single-file stubs
  with no tests, imported by nothing but each other. They were deleted on
  2026-09-05. The capabilities are still wanted and are registered in
  `docs/gaps.md`; what changed is that the repository no longer implies they
  are underway. Six packages remain, and every one of them is imported by
  something that runs.
- **`tsc --build` still does not work.** The old cause is gone with
  `packages/compiler/src/compile.ts`, but two new ones are visible underneath:
  the per-package tsconfigs have no `@metis/core/domain` path mapping, and
  `bench/harness` sets a `rootDir` that its own imports fall outside. The
  console's `tsc --noEmit` is what actually typechecks `core`, `runtime` and
  `compiler` today. Registered in `docs/gaps.md`.
- **One of four declared services is real.** `docker-compose.yml` declares
  postgres, eventstore, redis and clickhouse. Only postgres is connected to, by
  the registry. Nothing opens a connection to the other three, so there is no
  event store, no online feature cache and no analytics store. `infrastructure/
  docker`, `k8s` and `migrations` are still empty directories — the one real
  migration lives in `packages/registry/migrations`.
- **Three of five planned ADRs exist.** Missing: DIR schema design, event
  sourcing, performance budgets.
- **Storybook runs on react-vite, not `@storybook/nextjs`.** Storybook 7 could not
  boot at all here: `@storybook/nextjs` resolves `next/config`, which Next.js 16
  removed, and the v7 renderer calls `ReactDOM.unmountComponentAtNode`, removed
  in React 19. Upgraded to Storybook 8.6 and switched to the plain React builder,
  which these presentational stories do not need Next for. A story that ever needs
  `next/image` or the app router will need that revisited.

---

## What was deleted on 2026-09-05, and why

Fourteen of nineteen packages were imported by nothing in live source. Every
reference to them came from another dead package, from the old compiler entry
points, or from a `tsconfig` path alias — never from code that runs.

Deleting them is not a scope reduction. Nothing that ran stopped running: the
full suite was green before and after, with no source change beyond deletions
and the wiring they required. What changed is that the repository no longer
implies that composability, regulatory packs, panel extensibility, simulation
and adaptive models are underway. They are registered as gaps in
`docs/gaps.md`, which is where an unbuilt capability belongs.

Also removed, for the same reason:

- **`verify-metis.js`**, which counted directories. It reported
  `Packages: 11/11 ✓` and `Phase 1 ✓ | Phase 3 ✓` for packages with no tests,
  then printed "Some components missing" and exited 0.
- **`test-metis.js`**, which loaded a fixture and logged that its nodes existed.
- **`docs/PHASES_SUMMARY.md`**, 579 lines marking Phases 0–4 "✅ Complete".
- **Four committed compiled artifacts.** Build output in git, embedding a
  node-type vocabulary nothing executes.
- **The Phase 0 DIR compiler and its schema.** Two compilers meant two
  definitions of what a strategy is, and only one of them ran.

### What the deletion surfaced

- **Three undeclared dependencies.** `class-variance-authority`, `clsx` and
  `tailwind-merge` are imported directly by `apps/console`, and the only
  package declaring them was `packages/ui-kit` — which the console never
  imported a symbol from. They resolved through workspace hoisting. Now
  declared where they are used, at the same resolved versions.
- **Six dependencies the console declared and never imported.**
- **A new diagnosis for `tsc --build`.** The old cause went with
  `packages/compiler/src/compile.ts`; two more were hiding underneath it.
