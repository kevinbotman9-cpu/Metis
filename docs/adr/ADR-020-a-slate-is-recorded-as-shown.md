# ADR-020: A slate is recorded as it was shown

**Status:** Proposed
**Date:** 2026-09-17 (proposed)
**Owner:** Product owner
**Decision needed by:** 2026-09-24, and in any case before ADR-019's mechanical
slice regenerates the seeded corpus. That reseed moves every decision id once
(ADR-019 §7). Clause 1 below moves every id too, so it costs nothing extra if it
lands in the same reseed. After that date it costs a second full identity move:
every decision regenerated again, and every pinned figure re-pinned again. The
queued "loses most" work and the frequency-cap slices wait on this ADR,
because both read eliminations and deliveries whose meaning it changes.
**Constrains:** `packages/runtime/src/slate.ts`;
`packages/runtime/src/shadow/index.ts`; the engine's arbitrate node
(`packages/runtime/src/deterministic/engine.ts`) and the Kotlin engine's;
`DeterministicDecision` (`packages/runtime/src/deterministic/types.ts`);
`docs/metis-api.openapi.yaml` (`DecisionRecord`, `recordOutcome`,
`decidePlacement`); `packages/ledger` (`performance.ts`, `policy-funnel.ts`, the
`outcome_events` table); both placement routes
(`planes/execution/src/server.ts`, `apps/console/app/api/[...path]/route.ts`);
the storefront (`apps/console/public/storefront/index.html`); the seed
(`apps/console/mocks/seed-ledger.ts`, `mocks/fixtures/synthetic-customers.ts`);
and the offer- and action-scoped caps of ADR-019 §4.
**Arises from:** a read-only survey of multi-slot placements on 2026-09-17, and
[G-010](../gaps.md), registered 2026-09-07 and still open.

## Context

**A placement with N slots shows N offers. The record names one.** The engine
decides one winner per request (`engine.ts`, the arbitrate case:
`candidates = ranked.slice(0, 1)`). The slate is built after the decision is
recorded. Both placement routes call `selectSlate(record.decision,
placement.slotCount)` and return its entries. They record nothing about it
except a single delivery row per decision. So for any placement with more
than one slot:

- **The record names one winner.** `winner` and `winnerOfferId` name slot 1
  (ADR-019 §3). `arbitration.runnerUp` names slot 2, and calls it a
  runner-up. The instruction that produced this ADR did not mention
  `runnerUp`. It is in the hashed decision and in both engines.
- **The slot count is in neither the record nor the hashed catalogue snapshot.**
  `CatalogueSnapshot` holds offers, targeting and frequency policies,
  arbitration, boosts and connectors. It does not hold placements. G-010 said
  this on 2026-09-07. A replay builds its slate from the placement *as it is
  configured now*.
- **The arbitrate step marks shown offers as eliminated.** Every finalist except
  the winner is denied `NOT_RANKED`. On screen that code reads *"It passed every
  gate and was beaten on priority by something else"*
  (`components/trace-cascade.ts`). For slots 2 to N that is false: they were on
  the page.
- **An outcome cannot name the offer it was about.** The storefront stores one
  decision id on the slot and reports `POST /outcomes/{tenant}/{decisionId}` with
  `{type, occurredAt}`. `OutcomeEvent` has no action field.
  `buildPerformance` credits every outcome to `entry.record.decision.winner`
  (`packages/ledger/src/performance.ts`). A click on the third card of
  `homepage_grid` is credited to the first card's offer.
- **Four places rank candidates, and two still break ties by name.** The engine
  and `packages/core/src/arbitration.ts` moved to declared order at ADR-019 §8
  (#98). `slate.ts` still uses `a.localeCompare(b)`, and its comment says it
  "mirrors the engine's own comparator exactly". So does
  `packages/runtime/src/shadow/index.ts`'s `ranking()`, which says "Same
  tie-break as the engine". The instruction named only `slate.ts`. Both are
  false after #98.

### What was measured

Measured on 2026-09-17 against all 10,400 seeded decisions, from
`buildSeededHistory`. The slates came from `selectSlate` with each placement's
fixture slot count. The probe was temporary and has been deleted.

| Placement | Channel | Slots | Decisions | Offered | Shown 0 / 1 / 2 | Delivery |
|---|---|---|---|---|---|---|
| `weekly_offers_send` | email | 2 | 3,466 | 1,394 | 2,072 / 652 / 742 | all `suppressed` |
| `triggered_outbound` | sms | 1 | 3,435 | 1,608 | 1,827 / 1,608 / — | all `suppressed` |
| `account_dashboard_hero` | web | 1 | 3,499 | 1,686 | 1,813 / 1,686 / — | dispatched |

- **3,466 decisions (33.3%) served a multi-slot placement, and 742 of them
  showed two offers.** All 3,466 are on the email send. `homepage_grid` has
  three slots and is not in the corpus. It is decided only when someone
  clicks through the storefront.
- **No outcome in the corpus is misattributed.** Multi-slot decisions carry 0
  impressions, 0 clicks, 0 acceptances, 0 rejections, 0 conversions and 0 of
  the 227,909 minor units of realised value. The corpus has 1,654 outcome
  events, and every one is on a single-slot decision. The reason is an
  accident, not the design: `outcomesFor` returns nothing unless the delivery was
  `dispatched`, and no adapter delivers email. The first email adapter makes
  this wrong for every two-offer send.
- **Ties: none.** No slate in the corpus has two finalists on equal priority.
  Declared-order tie-breaking changes 0 of the 10,400 slates, and slot 1 equals
  `winner` on all 4,688 offered decisions.
- **`NOT_RANKED` is wrong 742 times.** The corpus has 3,898 `NOT_RANKED`
  denials: 1,135 on the email send, 1,366 on sms and 1,397 on web. 742 of them
  were on screen, all on the email send. That is 19.0% of all such denials and
  65.4% of the email send's.
- **Changing the slot count would change old replays.** Changing
  `weekly_offers_send` from 2 slots to 1 would make 742 recorded decisions
  replay a slate other than the one they returned.

### How much of `/performance` is affected

| Figure | Reads today | If every shown offer counted | Wrong by |
|---|---|---|---|
| Decisions, offered, deliverable, measured, acted (the loop's decision counts) | unchanged | unchanged | nothing: these count decisions, not offers |
| Clicks, acceptances, conversions, realised value, every rate over them | unchanged | unchanged | nothing: see above |
| "Never had the chance": expected margin × offers on channels nothing delivers | 28,591,000 minor units | 34,687,000 | understated by 6,096,000 (17.6% of the corrected figure) |
| Expected margin on delivered channels | 16,085,000 | 16,085,000 | nothing: web is single-slot |
| `offered` on the email rows, per action | winners only | shown entries | `disney_plus` +335, `netflix` +218, `gaming_plus_bundle` +142, `5g_home_ultimate` +47, `fios_gigabit` 0; 742 in all |
| Policy funnel, `NOT_RANKED` removals | 3,898 | 3,156 | 742 shown offers counted as removed |

**So the premise that the seeded performance figures are misattributed does not
hold,** and I said it did before measuring. The misattribution is real in
the storefront. Every click on the second or third `homepage_grid` card counts
for the first card's offer. None of those decisions are in the corpus. In the
corpus, three things are wrong: the ceiling, the per-action offer counts on the
email rows, and the funnel's ranking stage.

## Decision

### 1. The record holds an ordered slate; `winner` stays, and is its first entry

`DeterministicDecision` gains `slotCount` (clause 2) and `slate`. The slate is
an ordered list of `{ rank, action, offerId, priority }`, one entry per slot
filled, best first. `offerId` is **stored**, for clause 3's reason: evidence must
not depend on a catalogue that has moved on. Today's placement response breaks
that rule. It fills `offerId` at response time from the *current* snapshot
(`offerByKey.get(e.action)` in `planes/execution/src/server.ts`).

`winner` and `winnerOfferId` stay as stored fields, with the meaning they have
now. The engine refuses to write a record where they disagree with `slate[0]`.
The refusal names the artifact, like the refusal in `orderCandidates`.
`arbitration.runnerUp` becomes *the best finalist the slate left out*. For one
slot that is the same candidate it names now.

The slate is written by the arbitrate node in **both engines**, not by the
route. Two engines that disagree about what was shown fail
`decision-conformance`. If the route composes the slate, one engine can drift
from the other without any check noticing.

**What each option costs in hashes:**

- **An ordered slate beside `winner` (chosen).** Every decision id moves once:
  all 10,400 seeded decisions and all 40 decision-corpus cases in each engine.
  A single-slot record also gains the two fields. That is the same move ADR-019
  §7 already makes, so landing both in one reseed adds no identity move.
  `inputSnapshotHash` does not move (clause 2), so ADR-019 §9's control still
  holds. Every reader of `winner` keeps working.
- **`winner` becomes the first entry of a list.** It moves the same hashes and
  gains no evidence. It also rewrites every reader of `winner`:
  `performance.ts`, `flow-volume.ts`, `policy-funnel.ts`, the memory store's
  filters, the PostgreSQL store's `record->'decision'->>'winner'` expressions,
  the seed, the synthetic outcome model, the Kotlin engine, the OpenAPI
  `DecisionRecord`, and every screen that shows a winning action. Rejected: a
  large change that makes the record no more truthful than the chosen option.
- **A placement with N slots is recorded as N decisions.** Outcome attribution
  comes free. Everything else gets worse:
  - Slot 2's decision must exclude slot 1's winner. That exclusion is a new
    input, and it must be hashed, or slot 2's record cannot explain why the
    best offer is missing. It also needs a new reason code, checked in both
    engines.
  - The N records need a shared slate id to be reassembled.
  - Each slot re-runs the whole flow, connector reads included, so one email
    can be built from two different readings of the same profile.
  - Latency multiplies by N on the path W-028's done-when gates on.
  - The email send's 3,466 decisions become 6,932 records, so the corpus
    becomes 13,866 and ADR-019 §7's pinned count moves.
  - One email becomes N delivery rows. The frequency caps count contacts per
    channel per period from those rows, so they would count one email as N
    contacts and suppress customers who were contacted once.

  Rejected.

**Rejected: record `slotCount` only and derive the slate on read.** That is
possible today, because priority order is the whole composition rule. It stays
correct only while every reader re-derives it identically. Two of the four
ranking implementations already got that wrong (Context). W-028's rules, such
as mutual exclusion, diversity and inventory, choose between candidates, and a
choice cannot be re-derived from priorities. What the customer was shown
should be a fact in the record.

### 2. The slot count is decision input, recorded on the decision and not in the catalogue snapshot

The placement route resolves `slotCount` from the placement when it decides,
and passes it on the request, as it already does with `placement`. The
engine records it on the decision beside `placement` and `channel`, and the
arbitrate node cuts the slate to it. `POST /api/decisions` takes an optional
`slotCount` and defaults to 1.

- **Not in `CatalogueSnapshot`.** G-010's reason still holds. A placement governs
  delivery. Hashing every placement into the snapshot would move
  `catalogueSnapshotHash` for every decision whenever any placement changed.
  Only this decision's slot count explains this decision.
- **Not in `request.input`.** `inputSnapshotHash` hashes the input alone, and
  ADR-019 §9 treats that hash as a control that must not move.
- **Replay uses the recorded count.** A replay under an edited placement returns
  the slate that was returned then. Today it would not, for 742 decisions.

**This closes G-010.**

### 3. The arbitrate step's survivors are the slate; `NOT_RANKED` means ranked below the last slot

The arbitrate step's `survived` becomes the slate's actions, in rank order.
`NOT_RANKED` is issued only for finalists ranked below the last filled slot. The
code keeps its name. Its meaning becomes *"passed every gate and ranked below
every slot the placement had"*. For one slot that means *beaten by the
winner*, which is what it means today, so single-slot eliminations are
unchanged. In the corpus, the eliminations of exactly 742 records change.

**Why this is true for both positions.** An offer in slot 2 passed every gate,
was ranked and was shown. It is a survivor, not a denial. An offer ranked
below the last slot passed every gate and was not shown. It is a denial, and
the only thing that beat it was the number of slots. Nothing is denied for
being second.

**Rejected: keep `NOT_RANKED` on shown entries and add a "shown" flag.** A
denial that did not deny anything makes every count of denials wrong: the funnel,
"loses most", and any figure built on eliminations.

**Readers that change:** the policy funnel's accounting check
(`policy-funnel.ts`, `counted + (winner ? 1 : 0) !== candidates`) becomes
`counted + slate.length`. Its "offered" stage stays a decision count.
`CODE_MEANING.NOT_RANKED` is reworded to the meaning above. `slate.ts`'s
`finalists` reads survivors and denials as it does now.

### 4. An outcome names the entry it was about; a delivery stays one contact

**The storefront sends the action key.** `recordOutcome`'s body gains
`action`: the action key of the slate entry the customer saw or acted on.

- **Required when the recorded slate has more than one entry.** Optional when it
  has one, and then it means that entry.
- **Refused with 422 when it names an action not in the recorded slate.** It is
  checked against the record, not the catalogue, for clause 3's reason. An
  outcome about something the decision did not show is not an outcome of that
  decision.
- **One impression per rendered entry, not per slot.** An impression is of an
  offer the customer could see (G-041). A grid with three rendered cards has
  had three.
- The storefront puts the action key on each rendered entry. The delegated
  click handler reads the nearest entry, not the slot.

`outcome_events` gains `action_key` in an expand-only migration. `buildPerformance`
credits an outcome to its `action`, and counts a row's `offered` as the
decisions whose slate showed that action, not those it won.

**Deliveries stay one row per decision.** A send is one contact however many
offers it carries, and ADR-019 §4's channel caps count contacts. Offer-scoped
and action-scoped caps count a delivery against **every entry of the decision's
recorded slate**, not only the winner. Counting only winners lets a
two-offer email contact someone about its second offer without limit. So an
offer-scoped cap query reads slate membership through `decision_id`. The cap
slice decides whether that join meets its bench gate or whether the action keys
are copied onto the delivery row, and measures before choosing. Channel caps do
not need the join.

### 5. The seeded corpus is regenerated once, in ADR-019's reseed

The corpus needs regenerating, because clause 1 changes every record. ADR-019
§7 already regenerates it, so this ADR adds no reseed of its own. **If the two
land in separate commits, every id moves twice. They should not.**

In the same commit:

- `outcomesFor` generates one outcome stream per rendered slate entry instead
  of per winner. In today's corpus that changes no figure, because no multi-slot
  placement dispatches. It is still the line that would be wrong the day an
  email adapter lands.
- The seed test pins the figures this ADR moves, with the old and new numbers
  in the commit message, as ADR-019 §7 requires. Those figures are the
  undelivered ceiling (28,591,000 to 34,687,000 before re-rolling), the
  per-action offer counts on the email rows (+742), and the funnel's ranking
  stage (−742). ADR-019's re-roll moves all of them again. The commit has to say
  which part of each change came from which ADR, or the figures cannot be
  checked.
- It asserts that `slate[0]` equals `winner` on every offered decision, and
  that every `NOT_RANKED` denial is of a finalist outside its decision's slate.

### 6. The first slice fixes the tie-break, whatever else is decided

`selectSlate` and `shadow/index.ts`'s `ranking()` both call
`orderCandidates` with the decision's own recorded `candidateKeys`. That order
is already in the hashed decision, so neither needs the artifact. One
comparator, not four.

The slice moves no hash, changes 0 of the 10,400 seeded slates (measured), and
can land before this ADR is accepted. Its checks: a slate over two
equal-priority finalists follows declared order where that differs from
alphabetical; a shadow comparison over the same tie does not report a
divergence. Each check is bitten by restoring `localeCompare`.

A rename must not be able to change what a customer sees, just as it must not
change a winner. That was the reason for ADR-019 §8, and #98 applied it to only
two of the four places it had to reach.

## Consequences

- **Every decision id moves**, within ADR-019's reseed. Nothing outside the ledger
  stores a decision id (ADR-019, Consequences).
- **Both engines change**, and the Kotlin engine's arbitrate node has to write
  the same slate. `decision-conformance` catches a disagreement only if a
  corpus case has more than one slot. **No case can today**, because the engine
  takes no slot count. The regenerated corpus needs at least one multi-slot case
  where the slot count separates `survived` from `NOT_RANKED`. Without one, the
  check has never been shown the thing it guards.
- **`recordOutcome` breaks existing callers** of a multi-entry decision. Any
  client that sends an outcome without `action` gets a 422 on a grid. The
  storefront is the only HTTP caller outside the tests. `e2e/ledger.spec.ts`
  also posts outcomes, and the portability import writes them at the store
  level. All three change in the same slice.
- **"Never had the chance" rises by about a fifth** in the seeded tenant, and
  the email rows' offer counts rise. Someone comparing screenshots from
  either side of the reseed will see both change, and neither is a change in
  behaviour.
- **The first thing that will be wrong:** a hand-built `DecisionRecord` in a
  test or fixture with no `slate`. The engine never writes one, but the
  fixtures in `mocks/fixtures/decisions.ts` and the ledger suite
  build records by hand. They fail typecheck, which is the right place to fail.
- **Nothing here makes a figure more real.** The outcomes are still a model and
  the labels still read synthetic (ADR-018 §8).

## Alternatives considered

**Leave the record alone and fix attribution only.** Add `action` to outcomes
and credit by it, and leave the slate unrecorded. It fixes the storefront's
misattribution and nothing else. The record still says slot 2 was beaten, a
replay still depends on today's slot count, and an offer-scoped cap still has
no recorded slate to count against. Rejected: attribution would then check
outcomes against a slate the record does not hold.

**Defer to W-028.** W-028 is slate *optimisation*: which N. The record shape
is needed as soon as more than one offer is shown, and 742 seeded decisions
already did. Deferring means building caps and "loses most" on eliminations
that call shown offers losses, then rebuilding both. Rejected on sequence.

**Separate decisions per slot.** Rejected in clause 1, chiefly because one
email becomes N contacts to the caps that are queued next.
