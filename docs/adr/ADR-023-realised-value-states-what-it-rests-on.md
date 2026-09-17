# ADR-023: Realised value states what it rests on, and is emphasised only when that is enough

**Status:** Accepted
**Date:** 2026-09-17 (proposed)
**Decided:** 2026-09-17
**Deciders:** Product owner
**Owner:** Product owner
**Accepted as proposed**, with a floor of 100. One wording change on building
it: the thin-figure sentence reads *"too few to read as a return: a count this
small swings about 20%"*, not *"a regeneration could move this by a fifth"*. A
real tenant is never regenerated, the count's spread is true of it anyway, and
the shorter sentence is 18px of the Overview's fit — a third clause took the
card to five wrapped lines.
**Amended the same day:** §3. The accent left this card for the funnel's largest
drop, because on every tenant that exists the figure is a dash or below the
floor, so the accent was never actually drawn.
**Decision needed by:** — decided. Built before ADR-019's reseed, which re-rolls
every outcome draw, so the screens say how far to trust the figure before it
moves again.
**Constrains:** `packages/ledger/src/performance.ts` (a count of valued
decisions); `docs/metis-api.openapi.yaml` (the performance report); `packages/client`;
`apps/console/lib/loop.ts`; `apps/console/components/loop-panes.tsx`
(`LoopFirstPaint`, the realised-value card, drawn on both `/performance` and the
Overview); their stories and tests.
**Arises from:** the realised-value figure moving 40% under ADR-022's
counterfactual with no behavioural difference, raised by the product owner on
2026-09-17; [G-047](../gaps.md).

## Context

**Realised value is the one accented figure on two screens.** `LoopFirstPaint`
gives it the console's `--accent` because *"Realised value is what the loop is
for"*, and says the accent goes nowhere else on the screen. Under it, the card
reads *"from 278 acted on"* on the seeded tenant.

**Measured on 2026-09-17**, by re-rolling the outcome model's draws 200 times
over the same 10,400 decisions — every roll the seeded decision under a different
id, which is exactly what a reseed does to them. Roll 0 is the corpus as seeded.

| Figure | As seeded | Mean of 200 | Coefficient of variation | 5th–95th percentile |
|---|---|---|---|---|
| Seen | 1,228 | 1,245 | **1.4%** | 1,217 – 1,275 |
| Acted on | 278 | 281 | **5.7%** | 257 – 308 |
| Acted on, share of seen ("loses most") | 22.6% | 22.6% | **5.5%** | 20.6% – 24.7% |
| Decisions carrying a value (conversions) | 24 | 35.8 | **17.8%** | 25 – 46 |
| **Realised value** | $2,279.09 | $3,453.19 | **17.7%** | $2,480.91 – $4,584.57 |
| Realised value per valued decision | $94.96 | $96.65 | **3.8%** | $90.52 – $102.94 |

Four things follow from the table.

- **It is the least stable figure on the page, by three times.** Its variation
  is 17.7% against 5.7% for the stage it is quoted beside.
- **Its instability is its count, not its values.** The value per valued decision
  varies 3.8%; the number of valued decisions varies 17.8%, and realised value
  follows the count almost exactly. The count behaves as counts of rare events do
  — the coefficient is close to 1/√n (at 35.8, 1/√n is 16.7%; measured 17.8%) —
  so the reliability of the figure is predictable from one number.
- **"from 278 acted on" names the wrong population.** 278 decisions were acted on;
  24 carried a value. A click is acted on and is worth nothing, and the figure's
  reliability is set by the 24.
- **The seeded tenant shows a low draw.** 24 conversions sits below the model's
  5th percentile of 25. The move to $3,201.10 under ADR-022's counterfactual was a
  move towards the model's mean, not away from truth.

**Found on the way, and not decided here.** Each seeded conversion's value is the
winning offer's expected margin ±35% (`synthetic-customers.ts`: *"±35% around the
offer's own margin"*). That is the construction the product owner rejected for
the storefront's Accept on 2026-09-17: expected margin is the unit of the
"Expected, at the ceiling" card, so seeded realised value tracks the ceiling by
construction and the two cards differ only by the conversion count. On a real
tenant the value comes from the channel; on the seeded one it does not.

## Decision

### 1. The card carries its count

The line under the figure names the decisions whose outcomes carried a value,
and the acted-on count beside it: *"from 24 valued outcomes, of 278 acted on"*.

- **The count is the report's, not the screen's.** `buildPerformance` gains
  `valued`: distinct decisions with at least one outcome carrying a non-null
  `valueMinor`, over the same population as `realised`. It is added to the spec
  and the client is regenerated; the card never infers it from rows.
- **Zero keeps its existing sentences.** Nothing acted on, and acted on with none
  carrying a value, already read correctly and are unchanged.

### 2. A floor, below which the figure is shown and said to be thin — not hidden

**`REALISED_FLOOR = 100` valued decisions.** Below it the figure is still drawn,
and the card says so beneath it: *"from 24 valued outcomes, of 278 acted on —
too few to read as a return: a count this small swings about 20%."* The fraction
in that sentence is not written by hand: it is 1/√n, rounded, from the same count.

- **Not hidden, because it is not an estimate.** A realised value is the sum of
  what was reported — on a real tenant, money a channel said it made. Replacing
  it with a sentence would put the one measured amount on the page out of sight
  at exactly the volume where someone is checking the loop by hand, and
  contradict "data can be zero; structure cannot vanish". The storefront's first
  Accept at USD 50 should read $50.00, from 1 valued outcome, and say it is thin.
- **Not `LOSES_MOST_FLOOR` (20).** That floor bounds a *share*: under 20 at the
  stage above, one decision moves it five points or more. This one bounds a *sum
  over rare events*, whose spread goes as 1/√n. At 20 valued decisions a figure
  still moves about 22% on a re-roll — and the seeded tenant, at 24, would clear
  it, so a floor of 20 would change nothing about the case that raised this. At
  100 the spread from the count alone is about 10% — still less stable than
  "acted on" at 5.7%, but no longer three times less.
- **The number is a proposal.** 100 is chosen for "about 10%"; the owner may want
  a different tolerance, and the sentence and the accent both follow whatever
  number is chosen.

### 3. The accent is on the funnel's largest drop, not on this card

*Amended 2026-09-17, the day this ADR was accepted, by the product owner: "the
largest drop … realised value is a dash too often to carry an accent."*

**The page's one accent marks the largest drop in the funnel that is not the
break. Realised value carries no accent at any count.**

- **What the first version said, and why it failed.** *"At or above the floor
  the card keeps the accent; below it the card is plain and nothing else takes
  it."* On every tenant that exists the figure is either a dash — nothing
  carried a value — or below the floor of 100, so the accent was never drawn.
  A rule whose effect is "no accent, ever" is not a rule about emphasis.
- **Why the largest drop earns it.** It is present whenever anything has been
  decided, it is the loss a person can act on, and it is what the evidence pane
  said in a sentence before that pane came off the Overview — so the colour
  replaces prose rather than decorating a figure.
- **The break keeps its own colour** and never takes the accent: a structural
  loss and the largest behavioural one are different findings, and the block
  colour already means the first.
- **Not "acted on"**, the other candidate. Rendered on the seeded tenant it puts
  the accent on a four-pixel sliver: 278 of 10,400 at one scale is a hairline,
  so the stage the loop exists to produce would carry the least visible mark on
  the page.
- The rule that stands: one accent on the page, and it is not on a figure that
  is usually absent.
- **The floor stays**, doing the job it is good at: above it the figure can be
  read as a return, below it the line says it cannot (§2).

## Consequences

- **The seeded tenant loses the accent** (24 valued decisions) on `/performance`
  and the Overview, and keeps losing it after ADR-019's reseed unless the
  re-rolled count clears 100 — which the 200 rolls say it will not (maximum 54).
  Every demo of the seeded tenant shows a thin realised value, stated as thin.
  That is true, and it is what G-047 has said since 2026-09-10.
- **A hand-driven tenant never reaches the floor by clicking** without a hundred
  Accepts. Its figure is drawn, counted and plain.
- **A contract change**: `valued` on the performance report, spec and client.
  Small, and it is the difference between the screen stating its sample and
  guessing at it.
- **The first thing that will be wrong**: a screenshot or stakeholder deck from
  before this lands, showing an accented $2,279.09 with no count. Nothing in the
  product can reach those.
- **Not decided here**: the seed deriving conversion value from expected margin
  (Context). If it should come from somewhere independent of the ceiling's unit,
  that is a change to the outcome model and belongs with ADR-019's reseed, which
  re-rolls the model anyway.

## Alternatives considered

**No floor; only the count.** The smallest change, and §1 alone. Rejected as
insufficient: the accent would still tell a reader to read the least stable
figure first, and the count would be a caveat under a headline that says the
opposite.

**Replace the figure with a sentence below the floor.** Rejected in §2: it hides
the one measured amount, and on a hand-driven tenant it would mean a person who
presses Accept never sees their own value.

**Use `LOSES_MOST_FLOOR` for consistency.** Rejected in §2: one threshold for two
different kinds of arithmetic is consistent in name only, and at 20 it does not
catch the seeded tenant.

**Show an interval (for example ±1/√n) instead of a floor.** Accurate, and
possibly right later. Rejected for now: an interval on a sum of reported money
reads as a forecast, and the report's own rule is *"Counting only: no attribution
or uplift"* (`performance.ts`). A stated count and a stated thinness say the same
thing without implying a model the report refuses to have.

**Move the accent to "acted on" below the floor.** Rejected in §3.
