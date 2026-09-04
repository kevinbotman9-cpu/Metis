# Experience Layer — Status

**Last verified:** 2026-09-04 by an automated suite, not by eye.

```
Determinism        28 passed   - packages/runtime, the Phase 0 gate
Unit (Vitest)      38 passed   - apps/console
E2E  (Playwright)  53 passed   - includes 18 axe checks, 0 WCAG 2.2 AA violations
Typecheck          clean
                  ---
                   119 tests
```

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
| `/strategies` | BUILT | Artifact list with versions and latency against budget. |
| `/strategies/[id]` | BUILT | **DIR canvas** (React Flow, read-only) with a node inspector. |
| `/decisions` | BUILT | 60 decisions, filters, sortable grid. |
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
| Data grid | BUILT | Sortable, keyboard-operable rows, responsive column hiding. |
| Loading / empty / error / permission-denied | BUILT | Shared primitives on every data surface. |
| Canvas | PARTIAL | Read-only. Node positions are authored, not laid out — a layout algorithm needs design review. |
| Dev API | BUILT | `app/api/[...path]/route.ts` over the store. |
| MSW | OPT-IN | `NEXT_PUBLIC_USE_MSW=true`. Service workers do not register in every embedded browser, so route handlers are the default. |
| Vitest | BUILT | 31 tests: autonomy resolution, money formatting, fixture referential integrity. |
| Playwright | BUILT | 52 tests: navigation, auth, decisions, RBAC, persistence, appearance. |
| axe-core | BUILT | 14 pages, light and dark. Zero violations at WCAG 2.2 AA. |
| Execution engine | BUILT | `packages/runtime/src/deterministic`. Byte-identical across 100 runs; replay compares chain hashes. |
| Engine-backed data | BUILT | The console's 60 decisions are real engine output, not fixtures. Replay re-executes. |
| Storybook | BUILT | 22 stories across Button, primitives, DataTable and the canvas node. Theme and density are toolbar globals, so all four axes are one click apart. Builds clean. |

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

---

## Honest limits

- **Persistence is in-memory.** A server restart restores the seed. Durable
  storage arrives with the execution plane.
- **The canvas is read-only.** No editing, no layout algorithm, no compile step.
- **The execution plane is real, but partial.** The deterministic engine,
  canonical hashing and replay are built and tested. The compiler, artifact
  registry and event store are still scaffolds, and there is no WASM hot path -
  the engine is plain TypeScript.
- **The original executor is still in the tree** at
  `packages/runtime/src/executor.ts`, exported as `executeLegacy` and marked as
  not replay-safe. The compiler's integration test still drives it, and that
  test uses Jest globals in a Vitest project, so it does not run.
- **Scoring models are seeded hashes, not models.** They have the property that
  matters here - same customer, proposition and pinned version gives the same
  number - but they predict nothing.
- **Agent activity is fixture data.** No agent is running; the feed shows what the
  autonomy model would record.
- **One browser.** Playwright runs Chromium only.
- **No visual regression testing.** axe covers accessibility, not appearance.
- **Storybook runs on react-vite, not `@storybook/nextjs`.** Storybook 7 could not
  boot at all here: `@storybook/nextjs` resolves `next/config`, which Next.js 16
  removed, and the v7 renderer calls `ReactDOM.unmountComponentAtNode`, removed
  in React 19. Upgraded to Storybook 8.6 and switched to the plain React builder,
  which these presentational stories do not need Next for. A story that ever needs
  `next/image` or the app router will need that revisited.
