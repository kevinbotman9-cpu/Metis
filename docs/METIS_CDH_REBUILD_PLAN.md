# METIS Console — Rebuild Plan (CDH-grade)

**Date:** 2026-09-04
**Status:** Proposed — supersedes optimistic status claims in `PHASES_SUMMARY.md`
**Trigger:** Audit found the console is a thin shell over an absent domain model.

---

## 1. Audit findings (verified, not claimed)

| # | Finding | Evidence |
|---|---|---|
| 1 | **5 of 7 nav links are 404** | Only `/`, `/decisions`, `/decisions/[id]` exist. `/decision-flows`, `/approvals`, `/audit`, `/settings`, `/themes` return "This page could not be found." |
| 2 | **Trace page ignores its route param** | `app/decisions/[id]/page.tsx` never reads `params.id`; it renders a module-level `MOCK_TRACE`. Every decision opens the identical page. |
| 3 | **Decision IDs are non-deterministic** | `MOCK_DECISIONS` uses `Math.random()` at module scope. IDs change on refresh, so no decision link is stable or resolvable. |
| 4 | **No authentication** | `auth-provider.tsx` hardcodes a logged-in admin. No `/login` route, no route guard, no session, no logout. Every visitor is `demo@company.com` with `admin`. |
| 5 | **No offer/offer domain model — at all** | Grep for offer/offer/creative returns only string literals in demo files. No Objective, no Category, no Offer, no Creative entity anywhere in `packages/` or the OpenAPI spec. |
| 6 | **CLAUDE.md rules 1 & 2 are violated in the current HEAD** | Sample data hardcoded in components; generated-client calls were removed and replaced with inline consts. The demo "works" because it is hardcoded. |
| 7 | **Packages are stubs** | ~3,100 lines across 19 packages; 15 of 19 are a single file. Largest is `compiler` at 652 lines. This is a scaffold, not a platform. |
| 8 | **No agentic AI concept in code** | Autonomy tiers exist only as prose in the Phase 0 plan. |

**Root cause:** surfaces were built before the domain model existed. There is nothing to show because nothing is modelled.

---

## 2. The missing core: a CDH-grade taxonomy

The "master offers and category them" gap. Adapted from Pega CDH's offer hierarchy:

```
Objective                     business objective        "Retention"
└─ Category                  product family            "Mobile Plans"
   └─ Offer         the offer itself          "5G Unlimited 24mo — £35"
      ├─ properties       margin, cost, priority, validity window
      ├─ eligibility      hard filters (age, credit, region)      — CAN we offer it?
      ├─ relevance    situational (not already on this plan)  — SHOULD we now?
      ├─ suitability      affordability / ethical                 — is it RIGHT for them?
      └─ Creative[]      channel-specific content
         ├─ Email         subject, body, sender
         ├─ SMS           160-char copy
         ├─ Web banner    image, headline, CTA
         └─ Push          title, body, deeplink
```

Cross-cutting concerns that must be modelled alongside:

- **Frequency policy** — suppression. Max N offers per channel per period; cooldown after reject.
- **Arbitration** — `Priority = P × V × B × C` (Propensity × Value × Boost × Context).
- **Boosts** — business weights that boost strategic offers without touching models.

**Integration with the existing DIR:** today a flow's candidate is the bare string `"upsell_5g"`. It must become a reference to a offer ID that resolves to a full object with creatives, financials and policies. This is the single change that makes every other surface have something real to render.

---

## 3. Agentic AI autonomy levels

The differentiator against Pega: Pega's AI scores; METIS's agents *author*. Autonomy must be a first-class, configurable control — not a global on/off.

| Level | Name | Agent may | Human gate | Rollback |
|---|---|---|---|---|
| **L0** | Observe | Explain decisions, answer "why did X get Y" | — | — |
| **L1** | Assist | Draft rules, copy, creatives as suggestions | Human writes the change | — |
| **L2** | Propose | Open a change set with diff + simulation | Approve before publish | Manual |
| **L3** | Bounded | Auto-publish inside guardrails (boost ±10%, no new audience, no new spend) | Post-hoc review | Automatic on guard breach |
| **L4** | Autonomous | Run experiments, promote winners, retire losers | Audit only | Automatic |

**Key design decision — autonomy is set per scope, not per tenant.** A regulated retention offer runs at L1 while a low-risk accessory upsell runs at L3. Scope resolution: `offer > category > objective > tenant`, most specific wins.

Guardrails configurable per level: blast radius (% traffic), allowed change types, budget delta cap, protected-attribute freeze, required simulation pass, bias-gate threshold.

This is compliance-first, which matches the Compliance Officer north star.

---

## 4. Target route map

```
/login                            real auth entry
/                                 overview
/offers                     tree: Objective > Category > Offer   ← offer mastering
/offers/[id]                detail: properties, financials, validity
/offers/[id]/creatives     per-channel content editor
/targeting-policies              eligibility / relevance / suitability
/frequency-policy                   suppression rules
/arbitration                      P×V×L×C formula + boost tuning
/decision-flows                       DIR list
/decision-flows/[id]                  canvas (read-only in v1)
/decisions                        search
/decisions/[id]                   trace (fix: read the route param)
/approvals                        change sets
/audit                            event log
/agentic                          autonomy levels, guardrails, agent activity
/simulations                      distribution test / what-if
/settings                         tenant, users, roles
```

---

## 5. Sequencing

**P0 — Make it honest.** Remove or implement every dead nav link. Fix trace routing to read `params.id`. Restore the generated-client → MSW data path and delete inline mock consts (restores CLAUDE.md rules 1 & 2). Add `/login`, route guard, session, working logout.

**P1 — Design system.** Real information density: data grids over stacked cards, proper layout grid and breakpoints, nav IA that reflects the route map, tokens actually applied. Everything built after this inherits it.

**P2 — Offer mastering.** Objective/Category/Offer/Creative in the OpenAPI spec, `packages/core` types, and MSW fixtures. Then the tree, detail and creative surfaces. *This is the biggest single value unlock.*

**P3 — Targeting policy, frequency policy, arbitration + boosts.**

**P4 — Agentic AI levels.** Scope-resolved autonomy config, guardrail editor, agent activity feed, AI-proposed change sets.

**P5 — Simulation, approvals, audit.**

---

## 6. Rules this plan re-asserts

- No sample data inside components — MSW fixtures only.
- No `fetch` in components — generated client only.
- No endpoint hand-added to `packages/client` — spec first, then regenerate.
- Every new capability absent from the platform gets registered in `docs/gaps.md`.
- Status claims must be verifiable by clicking. No surface is "done" until every link on it resolves.
