# Experience Layer — Status

**Last verified:** 2026-09-04, by clicking every link in a running console.

Legend: **BUILT** = runs and was clicked through · **SPEC** = in the OpenAPI contract, no UI ·
**MISSING** = not started.

Nothing is marked BUILT unless every link on the page resolves.

---

## Routes

| Route | Status | Notes |
|---|---|---|
| `/login` | BUILT | Real form, three demo accounts with different roles. Session token in localStorage. |
| `/` | BUILT | Overview: catalogue counts, decision volume, approval queue, agent activity. |
| `/propositions` | BUILT | Issue › Group tree with counts + sortable catalogue. Search and status filter. |
| `/propositions/[id]` | BUILT | Financials, per-channel treatments, three-tier engagement policy, resolved autonomy. |
| `/engagement-policies` | BUILT | Eligibility / applicability / suitability, with conditions rendered. |
| `/contact-policy` | BUILT | Frequency caps, cooldowns, scope. |
| `/arbitration` | BUILT | P × V × L × C weight editor + lever table. Gated on `edit:arbitration`. |
| `/strategies` | BUILT | Artifact list, versions, latency vs budget. Read-only; no canvas yet. |
| `/decisions` | BUILT | 60 decisions, filters, sortable grid. |
| `/decisions/[id]` | BUILT | Resolves its route param. Cascade, score composition, timings, replay, consent. |
| `/approvals` | BUILT | Change request queue, agent vs person provenance. |
| `/approvals/[id]` | BUILT | Diff table, simulation with bias gate, approve/reject gated on permission. |
| `/agentic` | BUILT | L0–L4 ladder, per-scope guardrails, agent activity feed with breaches. |
| `/audit` | BUILT | Append-only event log, filterable by actor type. |
| `/settings` | BUILT | Account, roles, permissions, appearance, environment. |
| `/simulations` | PARTIAL | Shows simulations attached to change requests. Ad-hoc simulation is **not built** — the page says so. |

**Strategy canvas** (visual DIR editor): MISSING. Deferred; `/strategies` is a list for now.

---

## Foundations

| Concern | Status | Notes |
|---|---|---|
| Auth | BUILT | Login, session restore, route guard, logout, role-filtered nav, permission-gated actions. |
| Design tokens | BUILT | RGB-channel custom properties. Dark mode is a token swap; opacity modifiers work. |
| Density | BUILT | compact / comfortable drive row height, padding and type scale. |
| Data grid | BUILT | Sortable, keyboard-activatable rows, responsive column hiding. |
| Loading / empty / error / permission-denied | BUILT | Shared primitives, used on every data surface. |
| Dev API | BUILT | `app/api/[...path]/route.ts` serves the fixture store over HTTP. |
| MSW | OPT-IN | `NEXT_PUBLIC_USE_MSW=true`. Service workers do not register in every embedded browser, so route handlers are the default path. MSW remains for Storybook and Vitest. |
| Storybook stories | PARTIAL | Only `Button`. Others were removed rather than left broken after the primitives rewrite. |
| Playwright / axe | MISSING | No automated E2E or a11y run yet. |

---

## Domain model

`packages/core/src/domain.ts` — the CDH taxonomy that was previously absent entirely:

- `Issue` › `Group` › `Proposition` › `Treatment` (5 channels)
- `EngagementPolicy` (eligibility / applicability / suitability), `ContactPolicy`
- `ArbitrationConfig` (P × V × L × C exponent weights), `Lever`
- `AutonomySetting` (L0–L4) + `AutonomyGuardrails`, with `resolveAutonomy()` implementing
  most-specific-scope-wins: proposition › group › issue › tenant
- `AgentActivity`

Spec: 25 paths, 30 operations, 20 schemas in `docs/metis-api.openapi.yaml`.

---

## Honest limits

- **Writes do not persist.** The fixture store is read-only; PUT/POST echo back. Approving a
  change request updates the view, not a database.
- **The platform is still a scaffold.** ~3,100 lines across 19 packages, mostly single files.
  The console is ahead of the execution plane, which is the expected order but worth stating.
- **No automated tests yet.** Verification so far is manual click-through.
- **Agent activity is fixture data.** No agent is actually running; the feed shows what the
  autonomy model would record.
