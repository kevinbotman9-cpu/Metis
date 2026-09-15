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
