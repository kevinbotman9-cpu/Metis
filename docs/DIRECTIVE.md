# Current directive

**Issued:** Tuesday 15 September 2026, by the product owner.
**Amended:** Tuesday 15 September 2026, by the product owner: the work in scope became the design system read-back, and everything previously in scope moved out of scope.
**Expires:** Monday 21 September 2026. After that date this directive is not in force, and work is chosen as `CLAUDE.md` says: from `docs/JOURNEY_SPINES.md` in order, or from what the product owner has picked.
**Supersedes:** the build order in [ADR-016](adr/ADR-016-deployment-operations-and-scale.md), until it expires.
**Why:** an internal demo to Cognizant leadership and sales on Friday 18 September 2026. The audience will not use the console themselves. Nothing structural ships this week, and a half-built capability is worse for Friday than a declared gap.

This file exists so these constraints live in the repository rather than in a chat message.

## In scope

Design system only: a read-back, which changes nothing in the console. The drafts in `docs/design/` are drafts, not a specification (`docs/design/README.md`); layout, weight and density are the only things taken from them. The read-back answers five questions:

1. The drafts' shared token block: which of its names map onto a token the console already has, and which would need a new one.
2. If it is a value swap onto existing names, what breaks: the `tokens-only` conformance check, Storybook's four theme axes, contrast (`scripts/check-contrast.mjs` and the axe sweep), and the route bundle budgets.
3. What loading the drafts' two typefaces would cost against the bundle budgets, and whether a fallback gets most of the way.
4. Whether the console's top bar is one component or drawn per screen.
5. The smallest change that alters what is seen on the decision trace screen (`/decisions/[id]`), and whether it can land before the freeze.

## Out of scope this period

- Everything that was in scope before the amendment:
  - the three decision trace fixes, already merged in pull request #74;
  - regenerating `docs/DEMO_CLAIMS.md` (`npm run demo:claims`) and `bench/results/S1.json` (`npm run bench:s1`);
  - read-only audits and walks of the demo path;
  - the rehearsal on the freeze day, and its regression pass.
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

- **Thursday 17 September 2026 is the freeze.** No fixes after the second clean run, unless that run itself fails.
- **Friday 18 September 2026 is the demo.**

## Ceilings

- Conformance may not exceed 23 failures and 2 warnings.

## How work proceeds under it

- One branch per work item, `npm run gates:quick` before every push, and no direct commits to `main`.
- Stop and ask rather than expanding scope.
- Every session reports the conformance count.
