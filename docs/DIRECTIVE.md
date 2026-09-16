# Current directive

**Issued:** Tuesday 15 September 2026, by the product owner, superseding the demo-week directive issued the same morning.
**Why:** the internal demo on Friday 18 September 2026 is no longer the priority. No more work is aimed at it. The platform's data layer is: which operations run against a real store, what each remaining one needs, and what has to land before it.
**Expires:** not set. It stays in force until the product owner replaces it.

This file exists so these constraints live in the repository rather than in a chat message.

## In scope

1. This amendment.
2. A read-only survey of the data layer, before any code. It answers five questions:
   1. Which operations the decision service (`planes/execution`) serves against PostgreSQL today, and which still run through the console's development API over `apps/console/mocks/store.ts`.
   2. For each remaining operation, what a real implementation needs: schema, store, migration, service route and generated client method.
   3. Which screens show figures that are fixture values with no real source, and what each would have to be computed from.
   4. What has to land first. The product owner's assumption is tenant provisioning and authentication; the survey confirms or corrects it.
   5. The order, in slices, with an honest estimate and the parts that cannot be sized yet.
3. Then stop. The product owner picks the first slice from the survey.

## The data-layer order

Delivered on 2026-09-15 by the survey and amended the same day. Each slice is its own pull request. The product owner picks the next; estimates are in working days, and "unsized" means the slice waits on a decision that fixes its size.

| # | Slice | Estimate | State |
|---|---|---|---|
| 1 | ADR-018: the seeded corpus becomes ledger rows, and screens read only the ledger | 0.5 | Accepted 2026-09-15 |
| 2a | The seed job; the in-memory seed for development and e2e, restored on reset; the 45-second warm-up threshold; the per-decision tests for decisions, the delivery gate and outcomes; the outcome reads corrected so the ledger's events are not counted twice (ADR-018 §2, §3, §5, §6) | 1–1.5 | In progress |
| 2b | Ledger query fields and their index migration; decision search on the ledger, customer by subject hash; `npm run seed:ledger` over PostgreSQL with `--reset`, refused unless the ledger is synthetic and `--tenant` names the tenant | 1–1.5 | |
| 3 | Performance, the policy funnel, flow volume and outcomes read the ledger alone; the committed index and the projection's read path deleted | 1–2 | |
| 4 | The console calls the decision service for decisions; the e2e harness starts the service | 1–2 | |
| 5 | Trace, replay, outcomes and deliveries served by the decision service (ADR-016 §1) | 1–2 | |
| 6 | ADR: identity, closing G-115 | 0.5–1 to write | |
| 7 | Tenant provisioning (ADR-016 §2): control-plane store, `tenants`, `metis tenant create`, tenant settings moved, refusals | 2–3 | |
| 8 | Users and sessions, as slice 6 decides | unsized | |
| 9 | Autonomy settings into the governance store, audited | 0.5–1 | |
| 10 | Protect the subject in the ledger: a keyed subject hash and per-subject encryption (G-068, ADR-004 clauses 1–3), after the key store is chosen. It follows tenant provisioning, because keys live in the tenant's namespace, and precedes the profile store, which ADR-004's protection has to cover | unsized until the key store is chosen | |
| 11 | The profile store and durable intake (ADR-014 §3 and §5) | 3–5 | |
| 12 | Simulation over ledger history, with a bias metric decided by ADR | unsized | |
| 13 | A durable connector call log | 0.5–1 | |
| 14 | Agent activity | out until an agent runtime exists | |

## Do not touch

Nothing, except what the survey shows has to come first. Those items go here, named, once the survey is delivered.

New ADRs are allowed again. This work needs them.

## Ceilings

- Conformance may not exceed 23 failures and 2 warnings, as `CLAUDE.md` and `docs/ux-conformance-baseline.json` already require.

## How work proceeds under it

- One branch per work item, `npm run gates:quick` before every push, and no direct commits to `main`.
- Stop and ask rather than expanding scope.
- Every session reports the conformance count.

## What this replaces

The demo-week directive, issued and amended on 15 September 2026, pointed every change at Friday's demo. Everything it put in scope was merged that day, from #74 to #86: the decision trace fixes; the Architect home fixes and UX pass; the trace UX pass; the approvals badge; the sign-in page; `/decisions` opening on "Offer made"; G-133; and the regenerated `docs/DEMO_CLAIMS.md`. Its freeze, rehearsal and regression pass on Thursday 17 September are withdrawn with it. Its record of the environment label stands as a fact about any demo build: `NEXT_PUBLIC_ENV_LABEL=Demo` is set on the machine before the build and is not committed.
