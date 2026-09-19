# ADR-024: An acceptance and a conversion are stages of one sale, and the conversion's value supersedes

**Status:** Accepted
**Date:** 2026-09-18 (proposed)
**Decided:** 2026-09-18
**Deciders:** Product owner
**Owner:** Product owner
**Accepted with two changes to the proposal**, both taken from its own
alternatives: a sale's value is the conversion's when there is one, not the
largest (§1, §2); and a sale is a decision and an action, not a decision (§2),
as proposed. The proposal's "largest" is now the first rejected alternative.
**Decision needed by:** — decided. Built before anything reports both an
acceptance and a conversion with a value for the same offer; nothing does today
(Context).
**Constrains:** `packages/ledger/src/performance.ts` (`buildPerformance`, the
per-row `valueMinor` and the realised total); `docs/metis-api.openapi.yaml` (the
`valueMinor` of an outcome and of a performance row); `apps/console/lib/loop.ts`
(realised value); ADR-023, whose count of valued decisions is unchanged.
**Arises from:** the product owner's question on 2026-09-18, justifying the
loop's $850.00 row by row: whether a conversion contributes as well as an
acceptance. [G-165](../gaps.md). Related: [G-164](../gaps.md), the same fact
arriving twice.

## Context

`buildPerformance` adds the value of every outcome of every type
(`performance.ts`, the row loop). So a decision whose offer was accepted at $50
and then confirmed as a conversion at $120 reports **$170.00 realised**, one
valued decision. If the two are stages of one sale — accepted, then confirmed —
that is the same money counted twice, and nothing on the page says so: the
valued count is 1, the acceptance and conversion counts are 1 each, and only the
total is wrong.

Neither the spec nor ADR-023 said what the two values mean. ADR-023 decided what
realised value must say about its sample; it took the sum as given.

**Measured on 2026-09-18, the cost today is nothing.**

- **The seeded corpus** (10,400 decisions, executed in memory): 32 valued
  decisions, every one valued by a single conversion, none by an acceptance,
  none with more than one valued outcome. Realised value is **316,114 minor
  units ($3,161.14) summed, and 316,114 under this ADR.** No decision moves.
- **The storefront ledger** (`metis_dev`, 298 decisions made by using the demo):
  17 valued decisions, every one an acceptance at the panel's $50, no
  conversions at all. $850.00 either way.

*The premise this was raised on, corrected in the record (the product owner,
2026-09-18): the change was expected to cost something in the seeded corpus
because conversions exist there. They do — 32 — but every one is the only
valued outcome of its decision, so there is nothing for a rule about two stages
to choose between, and nothing moves under any of the rules considered here.*

So this ADR changes what the figure means and no figure on any ledger that
exists. It is decided now because the first caller to report both stages — a
channel confirming an order the storefront's Accept started — would move the
figure without moving any count.

## Decision

### 1. An acceptance and a conversion of the same offer are stages of one sale, and the conversion supersedes

An **acceptance** is the customer saying yes; a **conversion** is the sale
confirmed. For one offer on one decision they describe one sale at two moments.

**A conversion's value supersedes an acceptance's for the same sale, because it
reports what was bought rather than what was offered.** The acceptance carries
the value of the offer as it was accepted; the conversion carries the value of
the order that resulted, which is the one the business was paid. Where they
differ — an order confirmed for less than was accepted, or more — the
conversion is right.

- **A conversion that carries no value does not erase the acceptance's.** It
  confirms the sale without stating an amount, so nothing contradicts the
  acceptance, and its value stands.
- **The precedence is by type, not by arrival or size.** Outcomes arrive out of
  order across channels; an acceptance that arrives after its conversion does
  not replace it.

### 2. A sale is a decision and an action, and realised value is the sum of sales

A **sale** is one action on one decision: the decision id and the action its
outcomes name (ADR-020 §4). Its value is the conversion's when a conversion
carries one, the acceptance's otherwise (§1).

- **Per action, not per decision.** A slate of three can sell twice: a customer
  who accepts two cards of one grid decision has made two sales. Collapsing them
  per decision would keep one and drop the other, and undo on the money side
  what ADR-020 established for the record — that a decision can show, and a
  customer can take, more than one offer.
- **The realised total** is the sum of each sale's value over the decisions the
  report covers. A row's `valueMinor` is the sum over its sales.
- **`valued` does not change.** It counts decisions with at least one valued
  outcome, once each (ADR-023 §1).

### 3. A rejection carries no value that counts

A rejection is not a stage of a sale. If one carries a value it is not realised,
and it does not stand in for a sale's other outcomes.

## Consequences

- **No figure moves on any ledger that exists** (Context). The seeded corpus
  re-pins nothing; the storefront ledger reads the same.
- **The spec says what the value means.** The outcome's and the row's
  `valueMinor` descriptions state §1–§3, so a caller reporting a conversion knows
  it supersedes the acceptance's value rather than adding to it.
- **Tests state the cases:** $50 accepted then $120 converted reads $120.00; $50
  accepted then $30 converted — a partial order — reads $30.00; a conversion with
  no value leaves the acceptance's $50.00; two accepted cards on one grid
  decision read both. Each fails if the sum, or the maximum, comes back.
- **It does not stop the same fact arriving twice.** A second acceptance of the
  same card is G-164, refused at the ledger, not absorbed here: absorbing it
  would hide the duplicate's money while leaving the row for the next reader to
  sum.

## Alternatives considered

- **The largest value reported against the sale** (as proposed). The same
  answer as §1 whenever the conversion is the larger, and wrong on a **partial
  order** — a conversion confirming less than was accepted — the only case in
  which the two rules differ: the maximum keeps the acceptance's larger value
  and reports money the business was not paid. Rejected by the product owner on
  exactly that case.
- **The largest value per decision** (as first put, 2026-09-18). Also loses a
  second sale on a multi-slot slate (§2). Rejected.
- **Keep the sum.** Right if an acceptance and a conversion are separate amounts
  — a deposit and a balance. Rejected: they are stages of one sale.
- **The latest value.** Makes the figure depend on arrival order across
  channels. Rejected.
