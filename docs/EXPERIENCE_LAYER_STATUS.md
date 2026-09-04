# Experience Layer — Status

**Last verified:** 2026-09-04 by an automated suite, not by eye.

```
Unit (Vitest)      31 passed
E2E  (Playwright)  52 passed   — includes 18 axe checks, 0 WCAG 2.2 AA violations
Typecheck          clean
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
| `/decisions/[id]` | BUILT | Cascade, score composition, timings, replay, consent. Resolves its route param. |
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

---

## Honest limits

- **Persistence is in-memory.** A server restart restores the seed. Durable
  storage arrives with the execution plane.
- **The canvas is read-only.** No editing, no layout algorithm, no compile step.
- **The platform is still a scaffold.** ~3,500 lines across 19 packages. The
  console is well ahead of the execution plane.
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
