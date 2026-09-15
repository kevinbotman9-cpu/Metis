# Current directive

**Issued:** Tuesday 15 September 2026, by the product owner.
**Expires:** Monday 21 September 2026. After that date this directive is not in force, and work is chosen as `CLAUDE.md` says: from `docs/JOURNEY_SPINES.md` in order, or from what the product owner has picked.
**Supersedes:** the build order in [ADR-016](adr/ADR-016-deployment-operations-and-scale.md), until it expires.
**Why:** an internal demo to Cognizant leadership and sales on Friday 18 September. The audience will not use the console themselves. Nothing structural ships this week, and a half-built capability is worse for Friday than a declared gap.

This file exists so these constraints live in the repository rather than in a chat message.

## In scope

- Three fixes on the decision trace screen (`/decisions/[id]`), confirmed by the product owner on 15 September from the audit of the demo path, and merged in pull request #74:
  - the Candidates card reads "entered the flow", not "entered arbitration";
  - the arbitrate stage in the elimination funnel is labelled "Offered", not "Ranked" — the label only, in `apps/console/components/trace-cascade.ts`;
  - selecting candidates beaten on priority (`NOT_RANKED`) no longer draws the rule-shaped evidence rows, which could only ever read as absences.
- Writing this file.
- Regenerating the generated documents: `npm run demo:claims` (`docs/DEMO_CLAIMS.md`) and `npm run bench:s1` (`bench/results/S1.json`).
- Read-only audits and walks of the demo path: open a decision, read its trace (eliminations, the node that filtered each action, arbitration), replay it, see an identical result.
- The rehearsal on the freeze day, and its regression pass.

## Out of scope this period

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

- **Thursday 17 September 2026 is the freeze.** Rehearsal and regression only. No fixes after the second clean run, unless that run itself fails.
- **Friday 18 September 2026** is the demo.

## Ceilings

- Conformance may not exceed 23 failures and 2 warnings.

## How work proceeds under it

- One branch per work item, `npm run gates:quick` before every push, and no direct commits to `main`.
- Stop and ask rather than expanding scope.
- Every session reports the conformance count.
