# ADR-008: Closing the outcome loop, for one channel

**Status:** Accepted
**Date:** 2026-09-09 (proposed)
**Decided:** 2026-09-09
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided
**Constrains:** `packages/ledger` and its migration, the demo tenant seed,
`apps/console/public/storefront/`, the outcome ingress route, and the future
shape of W-013, W-017, W-018 and every attribution row in
`docs/CAPABILITIES.md`.
**Supersedes nothing. Does not supersede ADR-007** — the channel chosen below is
chosen partly to avoid depending on it.

## Context

`docs/evaluation/COHERENCE_REVIEW.md` found four registered work items —
outbound delivery (W-017), delivery telemetry (W-018), attribution, and lift —
and concluded they are not four gaps but one: *nothing leaves the building and
nothing comes back*. `/performance` states the consequence itself, in the
product, to anyone who opens it:

> Nothing has been reported back. 3,426 offers were made and no channel has
> recorded an impression, a click or an acceptance against any of them, so every
> rate below is empty rather than zero.

That sentence is the most honest thing on the screen and it has been true since
the screen existed.

**The surprising part is how much of the loop is already built.** Surveying it
for this ADR rather than assuming:

- **The outcome contract exists and is good.** `POST /outcomes/{tenantId}/{decisionId}`
  is `x-metis-status: built`, served, contract-tested. Five types — impression,
  click, acceptance, rejection, conversion — plus `occurredAt`, a nullable
  `valueMinor` and a free `detail`. It answers 404 when the decision does not
  exist, and the spec says why: *"an outcome for a decision nobody made is a
  mis-routed event or a mis-typed id… the kind of orphan found years later when
  someone tries to measure uplift."*
- **The store exists.** `outcome_events` in `packages/ledger/migrations/001_ledger.sql`:
  a `bigserial` sequence because two events can share a timestamp, a `CHECK` on
  the type, a foreign key to `decision_records`, an append-only trigger, and an
  index on `(tenant_id, decision_id, seq)`.
- **The report exists and is careful.** `buildPerformance` counts distinct
  decisions rather than events, takes rates over what was *observed* rather than
  what was offered, keeps suppressed decisions out of the denominator, and
  publishes coverage beside every rate.
- **The delivery surface exists.** `apps/console/public/storefront/index.html`
  is a 993-line page that requests a decision per placement and renders the
  winning offer. `storefront.test.ts` asserts the flows and placements it names
  are real.

So this is not a subsystem to design. **It is one missing edge: nothing calls
`POST /outcomes`.** Every other part of the loop was built, tested, and left
without a producer — which is why it reads as four gaps instead of one.

## Decision

### 1. The channel is the web placement, and email is deliberately not first

W-017 says "outbound channel adapter, one channel", and every reading of it so
far has assumed email. Email is the wrong first channel, for four reasons that
compound:

**It is blocked.** ADR-007's own text says: *"Blocks: any authenticated inbound
integration, and W-017 — an outbound email adapter needs a credential before it
can send anything."* When this was written ADR-007 was Proposed, so closing the
loop through email was gated on a security decision nobody had made. Both were
accepted on 2026-09-09, which removes the *decision* as a blocker and leaves the
implementation: `Connector` still has no `auth` field, nothing provisions a
secret, and the argument below stands on its own three remaining legs.

**It brings four more loops with it.** Bounce, deferral, complaint and
unsubscribe are not outcomes of a decision; they are events about a delivery
attempt, and unsubscribe has to write through to consent (W-013). A first
implementation that must handle all of them is not narrow.

**Its outcomes are ambiguous.** An email "impression" is an open pixel, which is
blocked by default on most clients and fabricated by others. The first thing
this loop must prove is that a number on `/performance` is trustworthy; opening
with the least trustworthy signal in the industry is a poor way to prove it.

**The web loop is already half-built.** The storefront requests decisions today.
The decision *is* the delivery: a web placement is decided at render time, so
delivery and impression happen in the same round trip, on a surface this
repository already owns and tests.

So: **the first closed loop is a web placement, from the storefront, reporting
`impression` and `click`.**

What this explicitly does **not** prove, and must be written on the row that
records it: it does not prove *outbound*. Nothing is queued, scheduled,
throttled, retried or bounced. A channel where the platform initiates is a
different problem and W-017 remains open for it.

### 2. The binding is the decision id, and nothing else

The decision response already carries its own id. The client echoes that id back
on the outcome. The foreign key enforces the rest.

This is stated as a decision because the tempting alternative — binding on
`(customer, offer, channel, time window)` and reconciling later — is precisely
the orphan the spec description warns about, and it is how most platforms end up
unable to answer "which decision caused this". A decision id is a content hash;
two decisions cannot share one without being the same decision. There is no
reconciliation step because there is nothing to reconcile.

**Double-firing is already safe for rates and not for value.** `buildPerformance`
counts *distinct decisions with at least one outcome of each type*, so an
impression fired twice reports one impression. But `realisedValueMinor` sums
over outcomes that carry a value, so a conversion delivered twice double-counts
money. This ADR does not add a uniqueness constraint — an append-only table
should be able to record that an event genuinely happened twice — and instead
requires that **the first implementation sends `valueMinor` only on
`conversion`, and that conversion carries a client-supplied idempotency key in
`detail`**, with de-duplication done in the report rather than the table. The
alternative, a unique index on `(tenant, decision, type)`, would make the store
lie about a customer who really did buy twice.

### 3. The interaction log stays in Postgres. ClickHouse stays unwired

The interaction log — the vocabulary's name for the append-only store decision
records and outcomes land in — **already exists**: `decision_records` and
`outcome_events`, joined by a foreign key, protected by a trigger, with a
behaviour suite that runs against both memory and a real database.

ClickHouse is declared in `docker-compose.yml` and connected to nothing, and
`docker-compose.yml` says so in a header comment before it declares it. It
should stay that way. ClickHouse is an *analytics* store: wide scans and
aggregates over volumes Postgres would struggle with. That is a different job
from being the system of record, and adopting it now would mean the first closed
loop ships with two stores, a synchronisation path and a question about which
one is true.

**The rule:** Postgres is the system of record for the interaction log.
ClickHouse becomes a read model derived from it when a measured query cost
justifies it — not before, and never as a second place outcomes are written.
The trigger for that decision is a `/performance` query over a tenant's full
history exceeding the latency budget on real hardware; until somebody has that
number, the store is a preference, not a requirement.

### 4. Outcome capture reaches Postgres by a swap, not a rewrite — and one FK problem

The console's store already holds a `DecisionLedger` over `InMemoryLedgerStore`.
`PostgresLedgerStore` implements the same interface and passes the same
behaviour suite. Durability is `createLedgerStore()` reading
`METIS_DATABASE_URL`, which already exists and is already tested. MSW stays
where it belongs, mocking for Storybook.

**But there is a real problem underneath, and it is the sharpest thing in this
ADR.** `apps/console/app/api/[...path]/route.ts` says it out loud:

> The console has two decision stores — the generated corpus it displays, and
> the ledger that runtime decisions land in — and `POST /outcomes` deliberately
> accepts either, because a seeded decision is real to this console even though
> it predates the ledger.

That works in memory, where nothing enforces the join. Against Postgres it does
not: `outcome_events` has a foreign key to `decision_records`, so an outcome
against any of the 10,400 seeded decisions is rejected. The demo tenant would
lose exactly the history that makes `/performance` worth looking at, and the
first response would be to relax the foreign key — which would delete the one
mechanism preventing the orphan the whole design is built to avoid.

**Decision: the seeded corpus becomes real rows.** The seed stops being a
fixture module the API reads around and becomes a loader that writes 10,400
`decision_records` into whichever store is configured. In memory this changes
nothing observable. Against Postgres it makes the demo tenant an ordinary
tenant, the foreign key holds, and the "two decision stores" comment can be
deleted rather than explained. The committed decision index stays as the fast
read path for the grid; it becomes a projection of the ledger rather than a
rival to it.

This is the largest piece of work in the proposal and it should be sequenced
last, because the loop can be proved without it.

### 5. Outcome ingress belongs on the execution plane, and this ADR does not build one

`planes/execution` contains **zero tracked files**. ADR-001 names an execution
plane and nothing has ever been put there; the decision API and the outcome
endpoint are both served by a Next.js route handler in the console.

Outcomes are the strongest argument yet for the plane actually existing. They
arrive from untrusted clients — a browser, eventually a partner's server — at
decision volume, and they need rate limiting, origin checks and a scaling
profile that has nothing in common with an authoring console. Serving them from
the console makes the console a production ingress permanently, and that is a
decision nobody would make deliberately.

It is also a deployment slice — container, configuration, health, routing,
observability — that would swallow this one entirely.

**Decision: outcome ingress stays on the console route for the first loop, and
the ADR names the condition that forces the move rather than leaving it to
drift.** It must move to `planes/execution` before **either** of:

- the first outcome producer that is not the demo storefront, or
- the first tenant that is not `demo-telco-uk`.

Until then the route carries a comment saying so and pointing here. A temporary
host that names its own expiry condition is a different thing from one that does
not.

### 6. What the demo tenant must generate

`/performance` is populated by seeding outcomes for the existing 10,400
decisions, deterministically from the same `seededUnitInterval('demo-telco-uk',
…)`. The requirements are shape requirements, not volume ones:

- **Only decisions that offered something.** 3,426 of 10,401 have a winner. A
  suppressed decision cannot have an impression, and generating one would make
  the frequency policy look like a failed offer.
- **A nested funnel.** conversion ⊆ acceptance ⊆ click ⊆ impression, so every
  rate is monotone. A corpus where clicks exceed impressions is the tell that
  the generator counted events rather than decisions, and it would silently
  invalidate the one property `buildPerformance` is built around.
- **Coverage deliberately below 100%.** If every offered decision has an
  outcome, `measured` and `offered` become the same number on screen, the
  distinction the report is designed around becomes invisible, and the next
  person to touch it removes it as redundant. Target roughly 55–75% of offered
  decisions reporting an impression, varying by channel — web highest, outbound
  call lowest.
- **Value on conversions only**, drawn from the winning offer's expected margin
  with real variance, so realised value and expected value differ. A demo where
  they match teaches the wrong thing about the product.
- **Correlated with the cohort that already exists.** The churn cohort — one
  customer in eleven, near contract end — should convert materially worse. The
  seed already models them; the outcomes should agree with the model rather than
  being drawn independently.
- **At least one offer that is offered often and accepted rarely.** The demo
  exists so a marketer can find something. A corpus where every offer performs
  adequately has nothing in it to find.

### 7. What the existing work items become

**W-017 (outbound channel adapter, one channel)** is **not** closed by this and
should not be re-scoped. It becomes *"the second channel, and the first that
sends"*, still blocked by ADR-007. Its value changes though: today it is the
only path to a closed loop, so it looks load-bearing. After this it is a
capability among others, and the loop it would have proved is already proved.

**W-018 (delivery and response telemetry)** is **partly closed**. The join —
"every telemetry event carries the `decision_id` and a test asserts the join" —
is proved for web. What remains is genuinely outbound-only: bounce, deferral,
complaint, and unsubscribe writing through to consent (W-013). W-018 should be
split rather than half-ticked, because a half-done work item is how a backlog
starts lying.

**The ABSENT attribution rows in `docs/CAPABILITIES.md`** — 14.7 through 14.11 —
do **not** become BUILT, and the temptation to move them is the main risk this
ADR carries. Counting is not attribution. What changes is that attribution
acquires its first input: today there is nothing to attribute. The choice of
window per objective, the choice of model, and the ability to compare two models
over the same data are a separate decision, and `performance.ts` already argues
in its own header why they must not be smuggled in beside the counts:

> Attribution modelling, uplift and incrementality are all statistical claims
> that would be unfalsifiable inside a platform whose selling point is that
> every number is traceable to its source.

**Incrementality (9.9, 14.11)** becomes *computable* rather than built. Holdout
arms exist and are deterministic; outcomes will exist; lift is then arithmetic
over two populations. What it still lacks is any statement of confidence, and
shipping a lift number without one would be the first unfalsifiable figure in
the product.

## Build first, defer

**First — the loop, in miniature.** The storefront reports `impression` when it
renders a decision and `click` when someone clicks the offer. One channel, two
outcome types, no attribution, no seeding. Proved by one `@screen-only` test:
open the storefront, click an offer, open `/performance`, see one impression and
one click against that action, and follow the row back to the decision that
produced it. This is the smallest change that makes the sentence on
`/performance` stop being true, and it touches no schema.

**Second — the demo tenant.** Seeded outcomes per §6, so the screen is populated
at rest with two years of history rather than with the single click a reviewer
just made. Fixture work, no architecture.

**Third — durability.** Point the ledger at Postgres, load the seeded corpus
into `decision_records` so the foreign key holds, and delete the "two decision
stores" comment. The largest piece, and the one the first two do not depend on.

**Deferred, with the reason:**

- **The execution plane** — a deployment slice, gated on the condition in §5.
- **ClickHouse** — gated on a measured query cost, per §3.
- **Attribution models and windows** — a separate ADR; this one deliberately
  stops at counting.
- **Incrementality** — needs a decision about confidence before it can be shown.
- **Outbound channels (W-017)** — gated on ADR-007.
- **Unsubscribe → consent (W-013)** — arrives with the first outbound channel,
  not before.
- **Acceptance and rejection from the storefront.** The first loop reports
  impression and click only. An "acceptance" on a web placement is a business
  event — an order, a plan change — that the storefront does not model, and
  faking one would put the least trustworthy number in the demo.

## Consequences

**The `/performance` sentence changes, and that is the point.** It currently
explains an absence. It should end up explaining a *partial* picture — coverage
of 60-something per cent, and what the missing 40 means — which is a harder
sentence to write and a more useful one to read.

**One number becomes wrong for the first time.** Every figure in this product is
currently either traceable or absent. A realised-value sum over
possibly-duplicated conversions is the first number that could be quietly wrong,
which is why §2 puts de-duplication in the report and an idempotency key in
`detail` rather than trusting the sender.

**The demo gets a fact it did not have.** A seeded corpus with outcomes can be
wrong in a way a corpus of decisions cannot: it can imply the platform works.
The requirement in §6 for an offer that performs badly is not decoration — it is
what keeps the demo a demonstration rather than a claim.

**`docs/CAPABILITIES.md` gains one row and must resist gaining five.** The row
is "outcomes are produced, joined and reported, for web". The five it must not
gain are the attribution items, and the coherence review's finding — that a map
row understating the product went unread for two days — cuts both ways here.

## Alternatives considered

**Email first, per the plain reading of W-017.** Rejected: blocked by ADR-007,
brings four event types and a consent writeback with it, and opens with the
least trustworthy impression signal available.

**Synthesise outcomes in the engine at decision time.** Cheapest possible route
to a populated `/performance`, and it would have been a lie told by the one
subsystem whose entire claim is that it does not tell them.

**A generic event ingest — `POST /events` with a type discriminator.** More
flexible, and it would have made the decision id optional in practice within one
release. The narrow endpoint that 404s on an unknown decision is the constraint
doing its job.

**Relax the `outcome_events` foreign key so seeded decisions can carry
outcomes.** Rejected in §4. It solves an afternoon's problem by removing the
mechanism that prevents the failure the spec text describes.

**Write outcomes to ClickHouse directly, since it is declared anyway.** Rejected
in §3: it makes the first closed loop ship with two stores and no answer about
which is authoritative.
