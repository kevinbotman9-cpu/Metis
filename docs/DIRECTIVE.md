# Current directive

**Issued:** Tuesday 15 September 2026, by the product owner.
**Amended:** Tuesday 15 September 2026, by the product owner, three times. The design system read-back and the diagnosis of the Architect home (`/`) were delivered that day. The third amendment put the fixes they found in scope, in a fixed order, and brought the rehearsal back.
**Expires:** Monday 21 September 2026. After that date this directive is not in force, and work is chosen as `CLAUDE.md` says: from `docs/JOURNEY_SPINES.md` in order, or from what the product owner has picked.
**Supersedes:** the build order in [ADR-016](adr/ADR-016-deployment-operations-and-scale.md), until it expires.
**Why:** an internal demo to Cognizant leadership and sales on Friday 18 September 2026. The audience will not use the console themselves. Nothing structural ships this week, and a half-built capability is worse for Friday than a declared gap.

This file exists so these constraints live in the repository rather than in a chat message.

## Friday's path

1. Sign in.
2. `/`, the Overview.
3. `/approvals/[id]`, a change set opened from the Overview.
4. `/decisions`, the decision list.
5. `/decisions/[id]`, the trace of the seeded decision `dec_c483550c88b04db0`: an offer made, four candidates ranked.
6. Replay that decision and see an identical result.

## In scope

Each item is its own pull request, in this order, with `npm run gates:quick` before the push and CI as the gate. If an item grows past its estimate, stop and ask rather than carry it into Thursday.

### Tuesday 15 September

1. This amendment.
2. The Architect home (`/`), inside its current layout:
   - the Proposed panel no longer stretches to the height of the panel beside it;
   - the permission identifier in "waiting for someone with approve:changes" is replaced with plain wording;
   - the Simulated panel's heading says what it covers, so the pending change sets it repeats from Proposed read as intended;
   - the bias ratio is shown against the bias gate threshold of the autonomy setting that resolves for the change set's scope.
3. The environment badge reads "Demo" on the server that runs Friday's demo (`NEXT_PUBLIC_ENV_LABEL=Demo`).

### Wednesday 16 September

4. The Cascade rail's stage figure, from 29px to 34px (`--text-figure-rail`).
5. `/decisions` opens filtered to "Offer made", with the tests that assume the old default updated.
6. The "approve:changes required" badge on `/approvals/[id]` reworded, with its end-to-end assertion.
7. The sign-in page no longer shows the demo password or the demo account cards.
8. `docs/DEMO_CLAIMS.md` regenerated (`npm run demo:claims`), so it reflects pull request #74 onward.

### Thursday 17 September: the freeze

9. The rehearsal: Friday's path walked twice from a clean start.
10. The regression pass.

## Out of scope this period

If either of the first two turns out to be needed for Friday, stop and say so.

- The pattern decision for the architect's `/` and any renderer it needs. The specification and ADR-015 assign it Dashboard, the draft draws a Cascade, and §4.7 of `docs/METIS_CONSOLE_SPEC.md` refuses a rail whose stages are not subsets.
- Anything that regenerates seeds, which moves every chain hash: the seeded decisions' dates and their recorded timings.
- Spine 1 and Spine 2. A fix that would also advance either is noted for after expiry, not made.
- Anything structural.
- The shared cascade rail's "removed" wording, which reaches five screens and three end-to-end specs.
- Three audit items the product owner declined on 15 September: removing the disabled "Export PDF" button from the trace header; the decision list's cards counting on two bases (the presenter explains it); renaming the seeded tenant in the provenance banner.
- The HTTP load script for M1 (ADR-016 §7). It is the first item after expiry.

## Do not touch

If one of these seems required for Friday, stop and say so rather than starting it.

- Authentication of any kind, including G-115.
- Tenant provisioning (ADR-016 §2).
- The propensity and model layer, including the model registry and any feature store.
- Configurability work, including rows in `docs/CAPABILITIES.md` and form descriptors.
- Any new ADR, refactor, dependency change or migration.
- The standing conformance failures: no attempt to reduce them.

## Fixed points

- **Thursday 17 September 2026 is the freeze.** Rehearsal and the regression pass only. No fixes after the second clean run, unless that run itself fails.
- **Friday 18 September 2026 is the demo.**

## Ceilings

- Conformance may not exceed 23 failures and 2 warnings.

## How work proceeds under it

- One branch per work item, `npm run gates:quick` before every push, and no direct commits to `main`.
- Stop and ask rather than expanding scope.
- Every session reports the conformance count.
